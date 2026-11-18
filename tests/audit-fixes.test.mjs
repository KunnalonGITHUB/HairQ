import assert from "node:assert/strict";
import {test} from "node:test";
import {fixture,harness} from "./support/firestore-harness.mjs";

// Regression tests for the customer-journey audit. In-memory Firestore only.
// Every time expectation is written in salon time (Asia/Kolkata), so these pass
// whatever timezone the test machine uses.
const {salonDateKey,salonTimeOnDay,addDaysToKey,salonClock}=harness().load('src/lib/salon-time.ts');
const today=()=>salonDateKey(new Date());
const todayAt=minutes=>salonTimeOnDay(today(),minutes);
const ctx={params:Promise.resolve({slug:'test-salon'})};
const json=async response=>({status:response.status,body:await response.json()});

function owner(h) {
  const bookings=h.load('src/app/api/owner/bookings/[id]/route.ts');
  const queue=h.load('src/app/api/owner/queue/[id]/route.ts');
  return {
    booking:(id,body)=>bookings.PATCH(new Request(`https://hairq.example.invalid/api/owner/bookings/${id}`,{method:'PATCH',body:JSON.stringify(body)}),{params:Promise.resolve({id:String(id)})}),
    queue:(id,body)=>queue.PATCH(new Request(`https://hairq.example.invalid/api/owner/queue/${id}`,{method:'PATCH',body:JSON.stringify(body)}),{params:Promise.resolve({id:String(id)})}),
  };
}
async function bookedToday(h,customerId=1,minutes=60) {
  const [booking]=await h.repo.bookingRepository.create(1,{customerId,serviceId:1,staffId:1,token:'booking-'+customerId+'-'+minutes,scheduledAt:todayAt(minutes)});
  return booking;
}
const queueRow=async(h,customerId)=>(await h.repo.queueRepository.list(1)).find(q=>q.customerId===customerId);

/* #1 #2 ------------------------------------------------- salon clock */

test('#1 open/closed follows the salon clock, not the server clock',()=> {
  const {openStatus}=harness().load('src/lib/salon-data.ts');
  const hours=Array.from({length:7},(_,dayOfWeek)=>({dayOfWeek,isClosed:false,openTime:'10:00',closeTime:'21:00'}));
  assert.equal(openStatus(hours,salonTimeOnDay('2030-01-02',10*60+5)).open,true);
  assert.equal(openStatus(hours,salonTimeOnDay('2030-01-02',9*60+30)).open,false);
  assert.equal(openStatus(hours,salonTimeOnDay('2030-01-02',21*60+30)).open,false);
  // 2030-01-02 is a Wednesday in the salon; a closed Wednesday is closed all salon-day.
  const wednesdayOff=hours.map(h=>h.dayOfWeek===3?{...h,isClosed:true}:h);
  assert.equal(openStatus(wednesdayOff,salonTimeOnDay('2030-01-02',12*60)).label,'Closed today');
  assert.equal(openStatus(wednesdayOff,salonTimeOnDay('2030-01-02',23*60+50)).label,'Closed today');
});
test('#2 turn and next-chair labels are salon clock times',()=> {
  const {clockLabel}=harness().load('src/lib/time.ts');
  assert.equal(clockLabel(salonTimeOnDay('2030-01-02',15*60)),'3:00 PM');
  assert.equal(clockLabel(salonTimeOnDay('2030-01-02',9*60+30)),'9:30 AM');
});

/* #3 #8 ---------------------------------------- joining with a phone */

test('#3 #8 a phone number alone cannot reclaim or cancel someone else\'s ticket',async()=> {
  const h=await fixture();const join=h.load('src/app/api/public/[slug]/queue/route.ts');
  const post=body=>join.POST(new Request('https://hairq.example.invalid/api/public/test-salon/queue',{method:'POST',body:JSON.stringify({name:'Asha',phone:'98765 43210',serviceId:1,...body})}),ctx).then(json);
  const first=await post({});
  assert.equal(first.status,201);
  const stranger=await post({name:'Someone else'});
  assert.equal(stranger.status,409);assert.equal(stranger.body.token,undefined);
  // Nothing was changed by the refused attempt.
  assert.equal((await h.repo.customerRepository.list(1)).find(c=>c.id===first.body.customerId).name,'Asha');
  // The device that holds the ticket gets it back, now with its customer id.
  const owner=await post({ticket:first.body.token});
  assert.equal(owner.status,200);assert.equal(owner.body.token,first.body.token);
  assert.equal(owner.body.customerId,first.body.customerId);assert.equal(owner.body.alreadyInQueue,true);
});

/* #4 #5 -------------------------------- appointments moved to the queue */

test('#4 cancelling an appointment releases its waiting queue place',async()=> {
  const h=await fixture();const api=owner(h);const booking=await bookedToday(h);
  assert.equal((await api.booking(booking.id,{action:'add_to_queue'})).status,200);
  assert.equal((await queueRow(h,1)).status,'waiting');
  assert.equal((await api.booking(booking.id,{action:'cancel'})).status,200);
  assert.equal((await queueRow(h,1)).status,'cancelled');
  assert.equal((await h.repo.bookingRepository.list(1))[0].status,'cancelled');
});
test('#4 an appointment in the chair cannot be cancelled away from its bill',async()=> {
  const h=await fixture();const api=owner(h);const booking=await bookedToday(h);
  await api.booking(booking.id,{action:'add_to_queue'});
  assert.equal((await api.queue((await queueRow(h,1)).id,{action:'start'})).status,200);
  assert.equal((await api.booking(booking.id,{action:'cancel'})).status,409);
  assert.equal((await h.repo.bookingRepository.list(1))[0].status,'arrived');
  assert.equal((await queueRow(h,1)).status,'serving');
  const customerCancel=h.load('src/app/api/public/[slug]/book/[token]/route.ts');
  const refused=await customerCancel.DELETE(new Request('https://hairq.example.invalid/x',{method:'DELETE'}),{params:Promise.resolve({slug:'test-salon',token:booking.token})});
  assert.equal(refused.status,409);
});
test('#4 completing one side never turns a cancelled partner into a sale',async()=> {
  const h=await fixture();const api=owner(h);const booking=await bookedToday(h);
  await api.booking(booking.id,{action:'add_to_queue'});
  // Legacy state: the booking was cancelled before cascading existed.
  await h.repo.bookingRepository.update(1,h.query.eq(h.fields.bookings.id,booking.id),{status:'cancelled'});
  assert.equal((await api.queue((await queueRow(h,1)).id,{action:'complete'})).status,200);
  const stored=(await h.repo.bookingRepository.list(1))[0];
  assert.equal(stored.status,'cancelled');assert.equal(stored.finalAmount,null);
  assert.equal((await h.repo.visitRepository.list(1)).length,1);
});
test('#4 a skipped queue entry is not revived when its appointment is completed',async()=> {
  const h=await fixture();const api=owner(h);const booking=await bookedToday(h);
  await api.booking(booking.id,{action:'add_to_queue'});
  await api.queue((await queueRow(h,1)).id,{action:'skip'});
  assert.equal((await api.booking(booking.id,{action:'complete'})).status,200);
  assert.equal((await queueRow(h,1)).status,'skipped');
  assert.equal((await h.repo.bookingRepository.list(1))[0].status,'completed');
});
test('#5 an appointment completed from the live queue counts as a booking visit',async()=> {
  const h=await fixture();const api=owner(h);const booking=await bookedToday(h);
  await api.booking(booking.id,{action:'add_to_queue'});
  await api.queue((await queueRow(h,1)).id,{action:'complete'});
  assert.equal((await h.repo.visitRepository.list(1))[0].source,'booking');
  const summary=h.load('src/app/api/owner/summary/route.ts');
  const range=(await (await summary.GET(new Request('https://hairq.example.invalid/api/owner/summary'))).json()).range;
  assert.equal(range.fromBooking,1);assert.equal(range.fromQueue,0);
});

/* #6 ---------------------------------------------- extras in analytics */

test('#6 visits itemise extras and service analytics credit each service',async()=> {
  const h=await fixture();const api=owner(h);
  await h.repo.serviceRepository.create(1,{name:'Beard Trim',price:120,durationMin:15});
  const [entry]=await h.repo.queueRepository.create(1,{customerId:1,serviceId:1,staffId:1,token:'extras',position:1});
  await api.queue(entry.id,{action:'complete',extraServices:[{serviceId:2},{name:'Head Massage',price:50}]});
  const visit=(await h.repo.visitRepository.list(1))[0];
  assert.equal(visit.amount,420);assert.equal(visit.serviceAmount,250);assert.equal(visit.extraServices.length,2);
  const summary=h.load('src/app/api/owner/summary/route.ts');
  const services=Array.from((await (await summary.GET(new Request('https://hairq.example.invalid/api/owner/summary'))).json()).range.services,s=>({...s}));
  assert.deepEqual(services.find(s=>s.name==='Test service'),{name:'Test service',count:1,revenue:250});
  assert.deepEqual(services.find(s=>s.name==='Beard Trim'),{name:'Beard Trim',count:1,revenue:120});
  assert.deepEqual(services.find(s=>s.name==='Head Massage'),{name:'Head Massage',count:1,revenue:50});
});
test('#6 older visits without a breakdown still credit their whole amount',async()=> {
  const h=await fixture();
  await h.repo.visitRepository.create(1,{customerId:1,serviceId:1,staffId:1,amount:400,completedAt:new Date()});
  const stored=h.db.data.get('salons/1/visits/1');delete stored.serviceAmount;delete stored.extraServices;
  const summary=h.load('src/app/api/owner/summary/route.ts');
  const services=(await (await summary.GET(new Request('https://hairq.example.invalid/api/owner/summary'))).json()).range.services;
  assert.equal(services[0].revenue,400);
});

/* #7 --------------------------------------------------------- capacity */

test('#7 capacity counts the waiting line, as the join screen and owner board do',async()=> {
  const h=await fixture(1);const api=owner(h);
  const [first]=await h.repo.queueRepository.create(1,{customerId:1,serviceId:1,staffId:1,token:'cap-1',position:1});
  await api.queue(first.id,{action:'start'});
  // One in the chair, nobody waiting: the cap of 1 still has room.
  const [second]=await h.repo.queueRepository.create(1,{customerId:2,serviceId:1,token:'cap-2',position:1});
  assert.equal(second.status,'waiting');
  await h.repo.customerRepository.create(1,{name:'Third',phone:'1234567893'});
  await assert.rejects(h.repo.queueRepository.create(1,{customerId:3,serviceId:1,token:'cap-3',position:1}),error=>error.status===409);
});

/* #9 ----------------------------------------- completing from waiting */

test('#9 a waiting customer completes even while their barber is busy, at the booked length',async()=> {
  const h=await fixture();const api=owner(h);
  const [busy]=await h.repo.queueRepository.create(1,{customerId:1,serviceId:1,staffId:1,token:'busy',position:1});
  await api.queue(busy.id,{action:'start'});
  const [waiting]=await h.repo.queueRepository.create(1,{customerId:2,serviceId:1,staffId:1,token:'waiting',position:2});
  assert.equal((await api.queue(waiting.id,{action:'complete'})).status,200);
  const visit=(await h.repo.visitRepository.list(1)).find(v=>v.customerId===2);
  assert.equal(visit.durationMin,30);assert.equal(visit.waitMin,0);
  assert.equal((await queueRow(h,1)).status,'serving');assert.equal((await queueRow(h,1)).position,1);
});

/* #10 ---------------------------------------------- analytics clock */

test('#10 busy hours and the daily series use salon hours and days',async()=> {
  const h=await fixture();
  const yesterday=addDaysToKey(today(),-1);
  await h.repo.visitRepository.create(1,{customerId:1,serviceId:1,amount:250,completedAt:salonTimeOnDay(yesterday,10*60+15)});
  const summary=h.load('src/app/api/owner/summary/route.ts');
  const range=(await (await summary.GET(new Request('https://hairq.example.invalid/api/owner/summary?days=7'))).json()).range;
  assert.equal(range.hours.find(b=>b.hour===10).count,1);
  assert.equal(range.series.find(d=>d.date===yesterday).revenue,250);
  assert.equal(range.series.at(-1).date,today());
});

/* #11 ------------------------------------------------- locked prices */

test('#11 the price is locked when booking and when joining the queue',async()=> {
  const h=await fixture();const api=owner(h);
  const create=h.load('src/app/api/owner/bookings/route.ts');
  const made=await create.POST(new Request('https://hairq.example.invalid/api/owner/bookings',{method:'POST',body:JSON.stringify({name:'Test customer A',phone:'1234567890',serviceId:1,staffId:1,scheduledAt:todayAt(60).toISOString()})}));
  assert.equal(made.status,201);const {booking}=await made.json();
  const join=h.load('src/app/api/owner/queue/route.ts');
  assert.equal((await join.POST(new Request('https://hairq.example.invalid/api/owner/queue',{method:'POST',body:JSON.stringify({name:'Test customer B',phone:'1234567891',serviceId:1})}))).status,201);
  await h.repo.serviceRepository.update(1,h.query.eq(h.fields.services.id,1),{price:300});
  // The owner's lists show the locked price too.
  const list=await (await create.GET(new Request('https://hairq.example.invalid/api/owner/bookings?scope=today'))).json();
  assert.equal(list.bookings[0].servicePrice,250);
  assert.equal((await (await join.GET(new Request('https://hairq.example.invalid/api/owner/queue'))).json()).waiting[0].servicePrice,250);
  await api.booking(booking.id,{action:'complete'});
  await api.queue((await queueRow(h,2)).id,{action:'complete'});
  assert.deepEqual((await h.repo.visitRepository.list(1)).map(v=>v.amount),[250,250]);
});
test('#11 entries saved before price locking use the current menu price',async()=> {
  const h=await fixture();const api=owner(h);
  const [entry]=await h.repo.queueRepository.create(1,{customerId:1,serviceId:1,token:'legacy',position:1});
  delete h.db.data.get('salons/1/queue/1').servicePrice;
  await h.repo.serviceRepository.update(1,h.query.eq(h.fields.services.id,1),{price:300});
  await api.queue(entry.id,{action:'complete'});
  assert.equal((await h.repo.visitRepository.list(1))[0].amount,300);
});

/* #12 ------------------------------------------ ETA around appointments */

test('#12 queue estimates leave room for a barber\'s upcoming appointment',()=> {
  const {projectQueue}=harness().load('src/lib/queue-engine.ts');
  const now=new Date('2030-01-02T06:00:00Z');const minutes=n=>new Date(now.getTime()+n*60000);
  const waiting=[{id:1,status:'waiting',position:1,durationMin:30,staffId:null,startedAt:null}];
  const chairs=[{staffId:1,name:'A'}];
  assert.equal(projectQueue(waiting,chairs,now).byEntry.get(1).waitMin,0);
  const reserved=[{staffId:1,start:minutes(10),durationMin:30}];
  const held=projectQueue(waiting,chairs,now,reserved);
  assert.equal(held.byEntry.get(1).waitMin,40);assert.equal(held.nextOpeningInMin,70);
  // A second barber without appointments takes the walk-in straight away.
  assert.equal(projectQueue(waiting,[...chairs,{staffId:2,name:'B'}],now,reserved).byEntry.get(1).chairStaffId,2);
});
test('#12 the live queue reads today\'s appointments into the estimate',async()=> {
  const h=await fixture();
  const soon=new Date(Math.ceil((Date.now()+5*60000)/60000)*60000);
  await h.repo.bookingRepository.create(1,{customerId:1,serviceId:1,staffId:1,token:'held',scheduledAt:soon,durationMin:30});
  await h.repo.queueRepository.create(1,{customerId:2,serviceId:1,token:'walk-in',position:1});
  const live=await h.load('src/lib/salon-data.ts').loadLiveQueue(1);
  // Only an appointment later today holds the chair; near midnight it may fall tomorrow.
  if(salonDateKey(soon)===today())assert.ok(live.waiting[0].waitMin>=30);
});

/* #13 ------------------------------------------------- phone spelling */

test('#13 the same number typed differently is one customer, legacy spellings included',async()=> {
  const h=await fixture();const data=h.load('src/lib/salon-data.ts');
  assert.equal((await h.store.runTransaction(()=>data.upsertCustomer({salonId:1,name:'A',phone:'+91 12345 67890'}),1)).id,1);
  assert.equal((await h.store.runTransaction(()=>data.upsertCustomer({salonId:1,name:'A',phone:'01234567890'}),1)).id,1);
  // A record stored before this change keeps working under every spelling.
  await h.repo.customerRepository.create(1,{name:'Legacy',phone:'+919876543210'});
  assert.equal((await h.store.runTransaction(()=>data.upsertCustomer({salonId:1,name:'L',phone:'98765 43210'}),1)).name,'Legacy');
  const lookup=h.load('src/app/api/public/[slug]/lookup/route.ts');
  const found=await json(await lookup.POST(new Request('https://hairq.example.invalid/x',{method:'POST',body:JSON.stringify({phone:'9876543210'})}),ctx));
  assert.equal(found.body.customer.name,'Legacy');
  assert.equal((await h.repo.customerRepository.list(1)).length,3);
  // A new record cannot duplicate an existing number in another spelling.
  await assert.rejects(h.repo.customerRepository.create(1,{name:'Dup',phone:'9876543210'}),error=>error.status===409);
});

/* #14 --------------------------------------------------- loose ends */

test('#14a a ₹0 visit earns no loyalty points',async()=> {
  const h=await fixture();
  await h.repo.serviceRepository.create(1,{name:'Free consult',price:0,durationMin:10});
  const [entry]=await h.repo.queueRepository.create(1,{customerId:1,serviceId:2,token:'free',position:1});
  await owner(h).queue(entry.id,{action:'complete'});
  const customer=(await h.repo.customerRepository.list(1)).find(c=>c.id===1);
  assert.equal(customer.totalVisits,1);assert.equal(customer.loyaltyPoints,0);
});
test('#14b an appointment on a later day cannot be completed from the bookings list',async()=> {
  const h=await fixture();const api=owner(h);
  const [later]=await h.repo.bookingRepository.create(1,{customerId:1,serviceId:1,staffId:1,token:'later',scheduledAt:salonTimeOnDay(addDaysToKey(today(),1),11*60)});
  assert.equal((await api.booking(later.id,{action:'complete'})).status,409);
  assert.equal((await h.repo.visitRepository.list(1)).length,0);
  // Coming in early still works through the live queue.
  assert.equal((await api.booking(later.id,{action:'add_to_queue'})).status,200);
  assert.equal((await api.queue((await queueRow(h,1)).id,{action:'complete'})).status,200);
  assert.equal((await h.repo.bookingRepository.list(1))[0].status,'completed');
});
test('#14d a missed booking confirmation is pushed once when alerts are switched on',async()=> {
  const h=await fixture();const notify=h.load('src/app/api/public/[slug]/notify/route.ts');
  await h.load('src/lib/salon-data.ts').pushNotification({salonId:1,customerId:1,type:'booking',title:'Appointment Confirmed',body:'See you soon'});
  assert.equal(h.db.pushes.length,0);
  const subscribe=()=>notify.POST(new Request('https://hairq.example.invalid/x',{method:'POST',body:JSON.stringify({customerId:1,permission:'granted',subscription:{endpoint:'https://push.example.invalid/device',keys:{p256dh:'test-key',auth:'test-auth'}}})}),ctx);
  assert.equal((await subscribe()).status,201);
  assert.equal(h.db.pushes.length,1);
  // Re-saving an already working subscription does not repeat it.
  assert.equal((await subscribe()).status,200);
  assert.equal(h.db.pushes.length,1);
});
test('#14d marketing messages are never replayed',async()=> {
  const h=await fixture();const notify=h.load('src/app/api/public/[slug]/notify/route.ts');
  await h.repo.notificationRepository.create(1,{customerId:1,type:'marketing',title:'Offer',body:'10% off'});
  await notify.POST(new Request('https://hairq.example.invalid/x',{method:'POST',body:JSON.stringify({customerId:1,permission:'granted',marketingOptIn:true,subscription:{endpoint:'https://push.example.invalid/m',keys:{p256dh:'k',auth:'a'}}})}),ctx);
  assert.equal(h.db.pushes.length,0);
});
