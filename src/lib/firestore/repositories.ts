import "server-only";
import type { EntityMap, EntityName } from "./entities";
import { compareRows, type Expression, type Ordering, type RowContext, type Selected, type Selection, value } from "./query";
import { assertSalonId, currentSalonId, defaults, listRows, mutate, nextId, readBucket, RepositoryError, rootSalons, validateShape, type RecordRow } from "./store";

interface FindOptions<S extends Selection | undefined = undefined> {
  select?: S;
  where?: Expression<boolean>;
  joins?: { table: EntityName; on: Expression<boolean>; left: boolean }[];
  orderBy?: Ordering[];
  limit?: number;
}
type Result<K extends EntityName,S> = S extends Selection ? Selected<S> : EntityMap[K];
type Patch = Record<string, unknown>;
const activeQueue = (row: RecordRow) => ["waiting","serving"].includes(String(row.status));
const activeBooking = (row: RecordRow) => ["confirmed","arrived"].includes(String(row.status));
const context = (table: EntityName,row: RecordRow): RowContext => ({[table]:row}) as RowContext;

async function reference(table: EntityName,salonId: number,id: unknown,optional=false) {
  if(id==null&&optional)return null;
  const row=(await readBucket(table,salonId)).rows.find(item=>item.id===id);
  if(!row)throw new RepositoryError(`Invalid ${table === 'staff'?'staff member':table === 'customers'?'customer':'service'} for this salon.`,400);
  return row;
}
async function validateRelationships(table:EntityName,salonId:number,row:RecordRow,old?:RecordRow) {
  validateShape(table,row);
  if(table==='customers') {
    if(!String(row.phone).replace(/\D/g,''))throw new RepositoryError("Add a valid phone number.",400);
    const duplicate=(await readBucket(table,salonId)).rows.some(item=>item.id!==row.id&&item.phone===row.phone);
    if(duplicate)throw new RepositoryError("A customer with that phone number already exists.",409);
    if(row.preferredStaffId!=null)await reference('staff',salonId,row.preferredStaffId);
    if(row.lastServiceId!=null)await reference('services',salonId,row.lastServiceId);
  }
  if(table==='workingHours') {
    if(!Number.isInteger(row.dayOfWeek)||Number(row.dayOfWeek)<0||Number(row.dayOfWeek)>6)throw new RepositoryError("Invalid day of week.",400);
    if((await readBucket(table,salonId)).rows.some(item=>item.id!==row.id&&item.dayOfWeek===row.dayOfWeek))throw new RepositoryError("Hours already exist for that day.",409);
  }
  if(table==='services' && (Number(row.price)<0||Number(row.durationMin)<=0))throw new RepositoryError("Price and duration must be valid.",400);
  if(table==='staffServices') {
    await reference('staff',salonId,row.staffId);await reference('services',salonId,row.serviceId);
    if((await readBucket(table,salonId)).rows.some(link=>link.id!==row.id&&link.staffId===row.staffId&&link.serviceId===row.serviceId))throw new RepositoryError("Duplicate staff/service relationship.",409);
  }
  if(['queueEntries','bookings','visits','pushSubscriptions','notifications'].includes(table))await reference('customers',salonId,row.customerId);
  if(table==='notifications'&&row.campaignId!=null&&(!old||old.campaignId!==row.campaignId)) {
    const campaign=(await readBucket('campaigns',salonId)).rows.find(item=>item.id===row.campaignId);
    if(!campaign)throw new RepositoryError("Campaign not found.",400);
  }
  if(table==='pushSubscriptions' && (await readBucket(table,salonId)).rows.some(item=>item.id!==row.id&&item.customerId===row.customerId))throw new RepositoryError("This customer already has a subscription record.",409);
  if(table==='queueEntries'||table==='bookings') {
    const service=await reference('services',salonId,row.serviceId);
    const operationChanged=!old||old.serviceId!==row.serviceId||old.staffId!==row.staffId||old.status!==row.status||String(old.scheduledAt)!==String(row.scheduledAt);
    if(operationChanged && (table==='queueEntries'?activeQueue(row):activeBooking(row))) {
      if((!old||old.serviceId!==row.serviceId)&&!service?.active)throw new RepositoryError("That service isn't available right now.",400);
      if(row.staffId!=null) {
        const member=await reference('staff',salonId,row.staffId);
        if(!member?.active)throw new RepositoryError("That staff member isn't available.",400);
        const links=(await readBucket('staffServices',salonId)).rows.filter(link=>link.staffId===row.staffId);
        // Existing HairQ treats an empty service mapping as capable of all services.
        if(links.length&&!links.some(link=>link.serviceId===row.serviceId))throw new RepositoryError("That staff member doesn't provide this service.",400);
      }
    }
    if(Number(row.durationMin)<=0)throw new RepositoryError("Invalid service duration.",400);
    const siblings=(await readBucket(table,salonId)).rows.filter(item=>item.id!==row.id);
    if(siblings.some(item=>item.token===row.token))throw new RepositoryError("Please retry this request.",409);
    if(table==='queueEntries') {
      if(!["waiting","serving","completed","cancelled","skipped","no_show"].includes(String(row.status)))throw new RepositoryError("Invalid queue status.",400);
      if(old&&!activeQueue(old)&&row.status!==old.status)throw new RepositoryError("That queue entry has already ended.",409);
      if(!old&&activeQueue(row)) {
        const salon=(await readBucket('salons',salonId)).rows[0];
        if(siblings.filter(activeQueue).length>=Number(salon.maxQueueSize))throw new RepositoryError("The queue is full right now. Please try again soon.",409);
        if(siblings.some(item=>activeQueue(item)&&item.customerId===row.customerId))throw new RepositoryError("This customer is already in the live queue.",409);
        row.position=Math.max(0,...siblings.filter(activeQueue).map(item=>Number(item.position)))+1;
      }
      if(row.status==='serving'&&row.staffId!=null&&siblings.some(item=>item.status==='serving'&&item.staffId===row.staffId))throw new RepositoryError("That staff member is already serving a customer.",409);
      if(row.status==='serving'&&row.chair&&siblings.some(item=>item.status==='serving'&&item.chair===row.chair))throw new RepositoryError("That chair is already occupied.",409);
    } else {
      if(!["confirmed","arrived","completed","cancelled","no_show"].includes(String(row.status)))throw new RepositoryError("Invalid booking status.",400);
      if(old&&["completed","no_show"].includes(String(old.status))&&row.status!==old.status)throw new RepositoryError("That appointment has already ended.",409);
      if(operationChanged&&activeBooking(row)) {
        const start=(row.scheduledAt as Date).getTime();const end=start+Number(row.durationMin)*60000;
        const overlapping=siblings.filter(item=>activeBooking(item)&&(item.scheduledAt as Date).getTime()<end&&(item.scheduledAt as Date).getTime()+Number(item.durationMin)*60000>start);
        if(overlapping.some(item=>item.customerId===row.customerId))throw new RepositoryError("This customer already has an appointment at that time.",409);
        if(row.staffId==null) {
          const team=(await readBucket('staff',salonId)).rows.filter(member=>member.active);
          const links=(await readBucket('staffServices',salonId)).rows;
          const eligible=team.filter(member=> {
            const mine=links.filter(link=>link.staffId===member.id);
            return (!mine.length||mine.some(link=>link.serviceId===row.serviceId))&&!overlapping.some(item=>item.staffId===member.id);
          });
          if(!eligible.length)throw new RepositoryError("That slot was just taken. Please choose another time.",409);
          row.staffId=eligible[0].id;
        }
        if(overlapping.some(item=>item.staffId===row.staffId||item.staffId==null))throw new RepositoryError("That slot was just taken. Please choose another time.",409);
      }
    }
  }
}

function repository<K extends EntityName>(table:K) {
  return {
    async list(salonId:number):Promise<EntityMap[K][]> { assertSalonId(salonId);return listRows(table,salonId); },
    async find<S extends Selection | undefined = undefined>(salonId:number|null,options:FindOptions<S>={}):Promise<Result<K,S>[]> {
      if(table!=='salons'&&salonId===null)throw new RepositoryError("A salon is required.",400);
      const equality=options.where?.equality;
      const rows=table==='salons'&&salonId===null?await rootSalons(equality?.field,equality?.value):await listRows(table,salonId!);
      let contexts:RowContext[]=rows.map(row=>({[table]:row}) as RowContext);
      for(const join of options.joins??[]) {
        if(salonId===null)throw new RepositoryError("A salon is required for related data.",400);
        const joined=await listRows(join.table,salonId);
        contexts=contexts.flatMap(base=> {
          const matches=joined.map(row=>({...base,[join.table]:row}) as RowContext).filter(row=>join.on.evaluate(row));
          return matches.length?matches:join.left?[{...base,[join.table]:null}]:[];
        });
      }
      if(options.where)contexts=contexts.filter(row=>options.where!.evaluate(row));
      const group=contexts;
      if(options.orderBy)contexts=[...contexts].sort((a,b)=>compareRows(a,b,options.orderBy!));
      if(options.limit!==undefined)contexts=contexts.slice(0,options.limit);
      return contexts.map(row=>options.select?Object.fromEntries(Object.entries(options.select).map(([key,expression])=>[key,expression.evaluate(row,group)])):row[table]) as Result<K,S>[];
    },
    async create(salonId:number,input:Patch|Patch[]):Promise<EntityMap[K][]> {
      return mutate(salonId,async()=> {
        const bucket=await readBucket(table,salonId);const result:EntityMap[K][]=[];
        for(const values of Array.isArray(input)?input:[input]) {
          const id=nextId(table,bucket);const row=defaults(table,values,id,salonId);
          await validateRelationships(table,salonId,row);bucket.rows.push(row);
          result.push((await listRows(table,salonId)).find(item=>item.id===id)!);
        }
        return result;
      });
    },
    async update(salonId:number,where:Expression<boolean>,patch:Patch):Promise<EntityMap[K][]> {
      return mutate(salonId,async()=> {
        const bucket=await readBucket(table,salonId);const ids:number[]=[];
        for(const old of [...bucket.rows])if(where.evaluate(context(table,old))) {
          const row={...old};
          for(const [key,v]of Object.entries(patch))if(v!==undefined) {
            if(key==='id'||key==='salonId'||!Object.hasOwn(row,key))throw new RepositoryError("Invalid update field.",400);
            row[key]=value(v,context(table,old));
          }
          await validateRelationships(table,salonId,row,old);
          bucket.rows[bucket.rows.findIndex(item=>item.id===row.id)]=row;ids.push(row.id);
        }
        return (await listRows(table,salonId)).filter(row=>ids.includes(row.id));
      });
    },
    async remove(salonId:number,where:Expression<boolean>):Promise<void> {
      return mutate(salonId,async()=> {
        const bucket=await readBucket(table,salonId);const removed=bucket.rows.filter(row=>where.evaluate(context(table,row)));const ids=removed.map(row=>row.id);
        if(table==='customers') {
          // Preserve cascading customer deletion, including nested subscriptions.
          for(const child of ['queueEntries','bookings','visits','pushSubscriptions','notifications'] as EntityName[]) {
            const children=await readBucket(child,salonId);children.rows=children.rows.filter(row=>!ids.includes(Number(row.customerId)));
            if(child==='queueEntries')children.rows.filter(activeQueue).sort((a,b)=>Number(a.position)-Number(b.position)||a.id-b.id).forEach((row,index)=>{row.position=index+1;});
          }
        }
        if(table==='services'||table==='staff') {
          const field=table==='services'?'serviceId':'staffId';
          const [queue,bookings,visits,customers]=await Promise.all(['queueEntries','bookings','visits','customers'].map(child=>readBucket(child as EntityName,salonId)));
          if(queue.rows.some(row=>ids.includes(Number(row[field]))&&activeQueue(row)))throw new RepositoryError("This item is still in use by the live queue.",409);
          const history=[...queue.rows,...bookings.rows,...visits.rows].some(row=>ids.includes(Number(row[field])))||customers.rows.some(row=>ids.includes(Number(row[table==='services'?'lastServiceId':'preferredStaffId'])));
          if(history) {
            for(const row of removed) {row.active=false;if(table==='staff')row.onShift=false;}
            return;
          }
          const links=await readBucket('staffServices',salonId);links.rows=links.rows.filter(row=>!ids.includes(Number(row[field])));
        }
        bucket.rows=bucket.rows.filter(row=>!ids.includes(row.id));
      });
    },
  };
}
export const salonRepository=repository('salons');
export const workingHoursRepository=repository('workingHours');
export const serviceRepository=repository('services');
export const staffRepository=repository('staff');
export const staffServiceRepository=repository('staffServices');
export const customerRepository=repository('customers');
export const pushSubscriptionRepository=repository('pushSubscriptions');
export const queueRepository=repository('queueEntries');
export const bookingRepository=repository('bookings');
export const visitRepository=repository('visits');
export const offerRepository=repository('offers');
export const campaignRepository=repository('campaigns');
export const notificationRepository=repository('notifications');

/** Completion, history and financial totals commit together and are idempotent. */
export async function completeVisit(salonId:number,source:'queueEntries'|'bookings',id:number) {
  return mutate(salonId,async()=> {
    const bucket=await readBucket(source,salonId);const entry=bucket.rows.find(row=>row.id===id);
    if(!entry)throw new RepositoryError("That record no longer exists.",404);
    if(entry.status==='completed')return null;
    if(source==='queueEntries'?!activeQueue(entry):!activeBooking(entry))throw new RepositoryError("That record has already ended.",409);
    const customers=await readBucket('customers',salonId);const customer=customers.rows.find(row=>row.id===entry.customerId)!;
    const service=await reference('services',salonId,entry.serviceId);const amount=Number(service?.price??0);
    const now=new Date();const started=entry.startedAt as Date|null;
    const waitMin=source==='bookings'?0:Math.max(0,Math.round(((started??now).getTime()-(entry.joinedAt as Date).getTime())/60000));
    const durationMin=source==='bookings'||!started?Number(entry.durationMin):Math.max(1,Math.round((now.getTime()-started.getTime())/60000));
    // A booking moved to the queue is one visit, whichever surface completes it.
    const related=source==='queueEntries'?entry.bookingId:entry.queueId;
    if(related!=null) {
      const other=await readBucket(source==='queueEntries'?'bookings':'queueEntries',salonId);
      const record=other.rows.find(row=>row.id===related);
      if(record?.status==='completed') {entry.status='completed';if(source==='queueEntries')entry.completedAt=now;return null;}
      if(record){record.status='completed';if(source==='bookings')record.completedAt=now;}
    }
    await visitRepository.create(salonId,{salonId,customerId:entry.customerId,serviceId:entry.serviceId,staffId:entry.staffId,source:source==='bookings'?'booking':entry.source==='walk_in'?'walk_in':'queue',amount,durationMin,waitMin,completedAt:now});
    customer.totalVisits=Number(customer.totalVisits)+1;customer.totalSpend=Number(customer.totalSpend)+amount;
    customer.loyaltyPoints=Number(customer.loyaltyPoints)+Math.max(1,Math.round(amount/50));
    customer.lastVisitAt=now;customer.lastActivityAt=now;customer.lastServiceId=entry.serviceId;
    if(source==='queueEntries'&&entry.staffId!=null)customer.preferredStaffId=entry.staffId;
    entry.status='completed';if(source==='queueEntries')entry.completedAt=now;
    if(source==='queueEntries'||related!=null) {
      const queue=await readBucket('queueEntries',salonId);
      queue.rows.filter(activeQueue).sort((a,b)=>Number(a.position)-Number(b.position)||a.id-b.id).forEach((row,index)=>{row.position=index+1;});
    }
    return {entry,durationMin,waitMin,amount};
  });
}
export async function linkBookingQueue(salonId:number,bookingId:number,queueId:number) {
  return mutate(salonId,async()=> {
  const booking=await reference('bookings',salonId,bookingId);const queue=await reference('queueEntries',salonId,queueId);
  if(!booking||!queue||booking.customerId!==queue.customerId)throw new RepositoryError("Invalid booking queue relationship.",400);
  booking.queueId=queueId;queue.bookingId=bookingId;
  });
}
export function authenticatedTenant():number {return currentSalonId();}
