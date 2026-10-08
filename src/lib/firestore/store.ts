import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { Timestamp, type Transaction, type DocumentReference } from "firebase-admin/firestore";
import { getFirebaseFirestore } from "../firebase/admin";
import type { EntityMap, EntityName } from "./entities";
import { collectionNames, metadata } from "./schema-metadata";
import { assertDocumentId } from "../firebase/repositories/paths";

export class RepositoryError extends Error {
  constructor(message: string, public readonly status = 409) { super(message); this.name = "RepositoryError"; }
}
export type RecordRow = { id: number; salonId?: number; [key: string]: unknown };
type Bucket = { rows: RecordRow[]; original: Map<number, RecordRow> };
type Scope = {
  transaction: Transaction; salonId: number | null;
  buckets: Map<EntityName, Promise<Bucket>>;
  counters: Record<string, number>; stateLoaded?: Promise<void>;
  pending: Map<string, { ref: DocumentReference; data: Record<string, unknown> | null }>;
  afterCommit: (() => Promise<unknown>)[];
};
const scopes = new AsyncLocalStorage<Scope>();
export function inTransaction() { return Boolean(scopes.getStore()); }
const copy = <T>(input: T): T => structuredClone(input);
export const digest = (input: string) => createHash("sha256").update(input).digest("hex");
export function currentSalonId(): number {
  const id = scopes.getStore()?.salonId;
  if (!id) throw new RepositoryError("A salon is required for this operation.", 400);
  return id;
}
export function assertSalonId(id: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw new RepositoryError("Invalid salon.", 400);
  const scope = scopes.getStore();
  if (scope?.salonId && scope.salonId !== id) throw new RepositoryError("Salon access denied.", 403);
}
export function decode<T>(input: unknown): T {
  if (input instanceof Timestamp) return input.toDate() as T;
  if (Array.isArray(input)) return input.map(item => decode(item)) as T;
  if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).map(([key,value])=>[key,decode(value)])) as T;
  return input as T;
}
export function encode(input: unknown): unknown {
  if (input instanceof Date) {
    if (!Number.isFinite(input.getTime())) throw new RepositoryError("Invalid date.",400);
    return Timestamp.fromDate(input);
  }
  if (Array.isArray(input)) return input.map(encode);
  if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).filter(([,v])=>v!==undefined).map(([k,v])=>[k,encode(v)]));
  return input;
}
export function documentRef(table: EntityName, salonId: number, row: RecordRow): DocumentReference {
  const firestore = getFirebaseFirestore();
  if (table === "salons") return firestore.doc(`salons/${row.id}`);
  if (table === "pushSubscriptions") return firestore.doc(`salons/${salonId}/customers/${row.customerId}/pushSubscriptions/${row.id}`);
  return firestore.doc(`salons/${salonId}/${collectionNames[table]}/${table === "workingHours" ? row.dayOfWeek : row.id}`);
}
async function ensureTenant(id: number) {
  assertSalonId(id);
  const scope=scopes.getStore();
  if (!scope) return;
  scope.salonId=id;
  scope.stateLoaded ??= (async()=> {
    const db=getFirebaseFirestore();
    const [salon,state]=await Promise.all([scope.transaction.get(db.doc(`salons/${id}`)),scope.transaction.get(db.doc(`salons/${id}/_meta/state`))]);
    if(!salon.exists)throw new RepositoryError("Salon not found.",404);
    scope.counters=(state.data()?.counters??{}) as Record<string,number>;
  })();
  await scope.stateLoaded;
}
export async function readBucket<K extends EntityName>(table: K,salonId: number): Promise<Bucket> {
  await ensureTenant(salonId);
  const scope=scopes.getStore();
  const load=async():Promise<Bucket>=> {
    const db=getFirebaseFirestore();
    const get=async(ref: DocumentReference)=>scope?scope.transaction.get(ref):ref.get();
    let rows:RecordRow[];
    if(table==='salons') {
      const doc=await get(db.doc(`salons/${salonId}`));rows=doc.exists?[decode<RecordRow>(doc.data())]:[];
    } else if(table==='staffServices') {
      const team=await readBucket('staff',salonId);
      rows=team.rows.flatMap(member=> ((member.serviceLinks as {id:number;serviceId:number}[]|undefined)??(member.serviceIds as number[]|undefined)?.map(serviceId=>({id:member.id*100000+serviceId,serviceId}))??[]).map(link=>({id:link.id, salonId,staffId:member.id,serviceId:link.serviceId})));
    } else if(table==='pushSubscriptions') {
      const customers=await readBucket('customers',salonId);
      const groups=await Promise.all(customers.rows.map(async(customer)=> {
        const query=db.collection(`salons/${salonId}/customers/${customer.id}/pushSubscriptions`);
        const snapshot=scope?await scope.transaction.get(query):await query.get();
        return snapshot.docs.map(doc=> {
          const row=decode<RecordRow>(doc.data());
          if(String(row.id)!==doc.id||row.customerId!==customer.id)throw new RepositoryError("Invalid subscription ownership data.",500);
          return row;
        });
      }));rows=groups.flat();
    }else {
      const query=db.collection(`salons/${salonId}/${collectionNames[table]}`);
      const snapshot=scope?await scope.transaction.get(query):await query.get();
      rows=snapshot.docs.map(doc=> {
        const row=decode<RecordRow>(doc.data());
        if(doc.id!==String(table==='workingHours'?row.dayOfWeek:row.id))throw new RepositoryError("Invalid document identifier in tenant data.",500);
        return row;
      });
    }
    if(rows.some(row=>row.salonId!==undefined&&row.salonId!==salonId))throw new RepositoryError("Invalid tenant data.",500);
    if(table==='salons'&&rows.some(row=>row.id!==salonId))throw new RepositoryError("Invalid salon identifier.",500);
    if(new Set(rows.map(row=>row.id)).size!==rows.length)throw new RepositoryError("Duplicate identifiers in tenant data.",500);
    try { for(const row of rows)validateShape(table,row); }
    catch { throw new RepositoryError("This salon's data needs migration validation.",500); }
    return {rows,original:new Map(rows.map(row=>[row.id,copy(row)]))};
  };
  if(!scope)return load();
  if(!scope.buckets.has(table))scope.buckets.set(table,load());
  return scope.buckets.get(table)!;
}
export async function listRows<K extends EntityName>(table:K,salonId:number):Promise<EntityMap[K][]> {
  const bucket=await readBucket(table,salonId);
  // Public DTOs exclude migration-only serviceLinks, bookingId, queueId, etc.
  const names=metadata[table].map(field=>field.name);
  return bucket.rows.map(row=>Object.fromEntries(names.map(name=>[name,row[name]??null]))) as unknown as EntityMap[K][];
}
export async function rootSalons(field?:string,value?:unknown) {
  const db=getFirebaseFirestore();const scope=scopes.getStore();
  if(scope?.salonId && !field)return listRows('salons',scope.salonId);
  if(field==='id'&&typeof value==='number')return listRows('salons',value);
  const query=field?db.collection('salons').where(field,'==',value):db.collection('salons').orderBy('id','desc').limit(1);
  const snapshot=scope?await scope.transaction.get(query):await query.get();
  return snapshot.docs.map(doc=> {
    const row=decode<EntityMap['salons']>(doc.data());
    if(String(row.id)!==doc.id)throw new RepositoryError("Invalid salon identifier.",500);
    return row;
  });
}
export function nextId(table:EntityName,bucket:Bucket) {
  const scope=scopes.getStore();if(!scope)throw new RepositoryError("Writes require a transaction.",500);
  const max=Math.max(scope.counters[table]??0,...bucket.rows.map(row=>row.id),...bucket.original.keys(),0);
  scope.counters[table]=max+1;return max+1;
}
export function defaults(table:EntityName,input:Record<string,unknown>,id:number,salonId:number):RecordRow {
  const row:RecordRow={id};
  for(const field of metadata[table]) {
    if(field.name==='id')continue;
    if(field.name==='salonId')row.salonId=salonId;
    else if('now' in field && field.now)row[field.name]=new Date();
    else if('default' in field && field.default!==undefined)row[field.name]=JSON.parse(field.default);
    else if(field.nullable)row[field.name]=null;
  }
  for(const [key,v]of Object.entries(input))if(v!==undefined)row[key]=v;
  if(row.id!==id || (row.salonId!==undefined&&row.salonId!==salonId))throw new RepositoryError("Invalid tenant data.",403);
  validateShape(table,row);return row;
}
export function validateShape(table:EntityName,row:RecordRow) {
  for(const field of metadata[table]) {
    const v=row[field.name];
    if(v==null) {if(!field.nullable)throw new RepositoryError(`Missing ${field.name}.`,400);continue;}
    const valid=field.kind==='timestamp'?v instanceof Date&&Number.isFinite(v.getTime()):field.kind==='integer'||field.kind==='serial'?typeof v==='number'&&Number.isSafeInteger(v):field.kind==='boolean'?typeof v==='boolean':typeof v==='string';
    if(!valid)throw new RepositoryError(`Invalid ${field.name}.`,400);
  }
}
export async function mutate<T>(salonId:number,fn:()=>Promise<T>):Promise<T> {
  if(scopes.getStore()) {await ensureTenant(salonId);return fn();}
  return runTransaction(fn,salonId);
}
export async function afterCommit(fn:()=>Promise<unknown>) {
  const scope=scopes.getStore();
  if(scope)scope.afterCommit.push(fn);else await fn();
}
export async function readRegistry(path:string):Promise<Record<string,unknown>|null> {
  const ref=getFirebaseFirestore().doc(path);const scope=scopes.getStore();
  const pending=scope?.pending.get(path);if(pending)return pending.data;
  const doc=scope?await scope.transaction.get(ref):await ref.get();return doc.exists?doc.data()!:null;
}
function stageRegistry(path:string,data:Record<string,unknown>|null) {
  const scope=scopes.getStore()!;scope.pending.set(path,{ref:getFirebaseFirestore().doc(path),data});
}
async function uniqueRegistry(path:string,data:Record<string,unknown>,matches:(existing:Record<string,unknown>)=>boolean) {
  const existing=await readRegistry(path);if(existing&&!matches(existing))throw new RepositoryError("That value is already in use.",409);
  stageRegistry(path,data);
}
async function prepareWrites(scope:Scope) {
  // Staff/service mappings live on staff documents and retain link IDs for API compatibility.
  const links=scope.buckets.has('staffServices')?await scope.buckets.get('staffServices')!:null;
  if(links && (links.rows.length!==links.original.size || links.rows.some(row=>JSON.stringify(row)!==JSON.stringify(links.original.get(row.id))))) {
    const team=await readBucket('staff',scope.salonId!);
    for(const member of team.rows) {
      const mine=links.rows.filter(link=>link.staffId===member.id);
      member.serviceIds=mine.map(link=>link.serviceId);
      member.serviceLinks=mine.map(link=>({id:link.id,serviceId:link.serviceId}));
    }
  }
  const changes:{table:EntityName;old?:RecordRow;row?:RecordRow}[]=[];
  for(const [table,promise]of scope.buckets) {
    if(table==='staffServices')continue;
    const bucket=await promise;
    for(const row of bucket.rows)if(JSON.stringify(row)!==JSON.stringify(bucket.original.get(row.id)))changes.push({table,row,old:bucket.original.get(row.id)});
    for(const [id,old]of bucket.original)if(!bucket.rows.some(row=>row.id===id))changes.push({table,old});
  }
  for(const {table,old,row}of changes) {
    if(table==='salons' && old?.slug!==row?.slug) {
      if(row) {
        const existing=await scope.transaction.get(getFirebaseFirestore().collection('salons').where('slug','==',row.slug));
        if(existing.docs.some(doc=>doc.data().id!==row.id))throw new RepositoryError("That salon link is already in use.",409);
        await uniqueRegistry(`salonSlugs/${row.slug}`,{salonId:row.id},e=>e.salonId===row.id);
      }
      if(old)stageRegistry(`salonSlugs/${old.slug}`,null);
    }
    if(table==='customers') {
      if(row)await uniqueRegistry(`salons/${scope.salonId}/customerPhones/${digest(String(row.phone))}`,{customerId:row.id},e=>e.customerId===row.id);
      if(old&&old.phone!==row?.phone)stageRegistry(`salons/${scope.salonId}/customerPhones/${digest(String(old.phone))}`,null);
    }
    if(table==='pushSubscriptions') {
      if(row?.endpoint)await uniqueRegistry(`pushEndpoints/${digest(String(row.endpoint))}`,{salonId:scope.salonId,customerId:row.customerId,subscriptionId:row.id},e=>e.salonId===scope.salonId&&e.subscriptionId===row.id);
      if(old?.endpoint&&old.endpoint!==row?.endpoint)stageRegistry(`pushEndpoints/${digest(String(old.endpoint))}`,null);
    }
    if((table==='queueEntries'||table==='bookings')&&row&&!old)await uniqueRegistry(`tokens/${digest(String(row.token))}`,{salonId:scope.salonId,entity:table,id:row.id},e=>e.salonId===scope.salonId&&e.entity===table&&e.id===row.id);
  }
  // Keep a safe ceiling below Firestore's transaction write/request limits.
  if(changes.length+scope.pending.size+1>450)throw new RepositoryError("This operation is too large. Please process a smaller group.",413);
  // All transaction reads are complete before this point.
  for(const {table,old,row}of changes) {
    const ref=documentRef(table,scope.salonId!,row??old!);
    if(row)scope.transaction.set(ref,encode(row) as Record<string,unknown>);else scope.transaction.delete(ref);
  }
  for(const {ref,data}of scope.pending.values())if(data)scope.transaction.set(ref,data);else scope.transaction.delete(ref);
  if(changes.length)scope.transaction.set(getFirebaseFirestore().doc(`salons/${scope.salonId}/_meta/state`),{counters:scope.counters,updatedAt:Timestamp.now()});
}
export async function runTransaction<T>(fn:()=>Promise<T>,salonId?:number):Promise<T> {
  if(scopes.getStore())return fn();
  let committedEffects:(()=>Promise<unknown>)[]=[];
  const result=await getFirebaseFirestore().runTransaction(async transaction=> {
    // A discarded attempt must never leave effects for a later failed attempt.
    committedEffects=[];
    const scope:Scope={transaction,salonId:salonId??null,buckets:new Map(),counters:{},pending:new Map(),afterCommit:[]};
    return scopes.run(scope,async()=> {
      if(salonId)await ensureTenant(salonId);
      const response=await fn();
      // Validation responses discard all tentative writes and effects.
      if(response instanceof Response&&response.status>=400)return response;
      if(scope.salonId)await prepareWrites(scope);
      committedEffects=scope.afterCommit;
      return response;
    });
  });
  const deliveries=await Promise.allSettled(committedEffects.map(effect=>effect()));
  if(result instanceof Response && committedEffects.length && result.headers.get('content-type')?.includes('application/json')) {
    const body=await result.clone().json();
    if(body && typeof body==='object' && 'delivery' in body) {
      const totals={sent:0,failed:0,skipped:0};
      for(const delivery of deliveries)if(delivery.status==='fulfilled'&&delivery.value&&typeof delivery.value==='object'&&'sent' in delivery.value) {
        const counts=delivery.value as typeof totals;
        totals.sent+=counts.sent;totals.failed+=counts.failed;totals.skipped+=counts.skipped;
      }
      return Response.json({...body,delivery:totals},{status:result.status,headers:result.headers}) as T;
    }
  }
  return result;
}

/** Explicit new-workspace provisioning only. Never imports existing data. */
export async function provisionSalon(salon:EntityMap['salons'],fn:()=>Promise<void>) {
  const db=getFirebaseFirestore();
  await db.runTransaction(async transaction=> {
    const ref=db.doc(`salons/${salon.id}`);const existing=await transaction.get(ref);
    if(existing.exists)throw new RepositoryError("Salon already exists.");
    const scope:Scope={transaction,salonId:salon.id,buckets:new Map(),counters:{},stateLoaded:Promise.resolve(),pending:new Map(),afterCommit:[]};
    await scopes.run(scope,async()=> {
      scope.buckets.set('salons',Promise.resolve({rows:[copy(salon) as unknown as RecordRow],original:new Map()}));
      await fn();await prepareWrites(scope);
    });
  });
}

/** UID and email must come from Firebase Admin verification, never request fields. */
export async function provisionOwnerWorkspace(identity:{uid:string;email:string;name:string},input:Partial<EntityMap['salons']>,seed:(salon:EntityMap['salons'])=>Promise<void>):Promise<EntityMap['salons']> {
  assertDocumentId(identity.uid);
  const db=getFirebaseFirestore();
  return db.runTransaction(async transaction=> {
    const userRef=db.doc(`users/${identity.uid}`);
    const existing=await transaction.get(userRef);
    if(existing.exists) {
      const user=existing.data()!;
      if(user.uid!==identity.uid||!user.active||!['owner','manager','front_desk'].includes(user.role)||!/^\d+$/.test(user.salonId))throw new RepositoryError("Salon access denied.",403);
      const salon=await transaction.get(db.doc(`salons/${user.salonId}`));
      if(!salon.exists)throw new RepositoryError("Salon access denied.",403);
      return decode(salon.data()!) as unknown as EntityMap['salons'];
    }
    const counterRef=db.doc('_meta/salonIds');
    const counter=await transaction.get(counterRef);
    const latest=await transaction.get(db.collection('salons').orderBy('id','desc').limit(1));
    const id=Math.max(Number(counter.data()?.lastId??0),Number(latest.docs[0]?.data().id??0))+1;
    if(!Number.isSafeInteger(id)||id<1)throw new RepositoryError("Workspace allocation unavailable.",503);
    const target=await transaction.get(db.doc(`salons/${id}`));
    if(target.exists)throw new RepositoryError("Workspace allocation conflict. Try again.",409);
    const salon=defaults('salons',input,id,id) as unknown as EntityMap['salons'];
    const scope:Scope={transaction,salonId:id,buckets:new Map(),counters:{},stateLoaded:Promise.resolve(),pending:new Map(),afterCommit:[]};
    return scopes.run(scope,async()=> {
      scope.buckets.set('salons',Promise.resolve({rows:[copy(salon) as unknown as RecordRow],original:new Map()}));
      await seed(salon);
      const now=Timestamp.now();
      scope.pending.set(userRef.path,{ref:userRef,data:{uid:identity.uid,email:identity.email,name:identity.name,role:'owner',salonId:String(id),staffId:null,active:true,createdAt:now,updatedAt:now,legacyOwnerId:null}});
      scope.pending.set(counterRef.path,{ref:counterRef,data:{lastId:id}});
      await prepareWrites(scope);
      return salon;
    });
  });
}
