import assert from "node:assert/strict";
import {test} from "node:test";
import {fixture,TestTimestamp} from "./support/firestore-harness.mjs";
const queueInput=(customerId,token)=>({customerId,serviceId:1,staffId:1,token,position:1});
const bookingInput=(customerId,token,scheduledAt=new Date('2030-01-01T10:00:00Z'))=>({customerId,serviceId:1,staffId:1,token,scheduledAt});

test('all schema fields survive DTO conversion; dates are stored as Timestamp',async()=> {
  const h=await fixture();const customer=(await h.repo.customerRepository.list(1))[0];
  assert.ok(customer.createdAt instanceof Date);assert.equal(customer.totalSpend,0);assert.equal(customer.notes,null);
  assert.ok(h.db.data.get('salons/1/customers/1').createdAt instanceof TestTimestamp);
  assert.deepEqual(Object.keys(customer).sort(),Array.from(h.load('src/lib/firestore/schema-metadata.ts').metadata.customers,f=>f.name).sort());
});
test('tenant scope rejects a cross-salon read or mutation',async()=> {
  const h=await fixture();
  await assert.rejects(h.store.runTransaction(()=>h.repo.customerRepository.list(2),1),error=>error.status===403);
  await assert.rejects(h.repo.customerRepository.list(0),error=>error.status===400);
});
test('concurrent customer creates enforce phone uniqueness on the server',async()=> {
  const h=await fixture();
  const results=await Promise.allSettled([h.repo.customerRepository.create(1,{name:'C',phone:'1234567892'}),h.repo.customerRepository.create(1,{name:'D',phone:'1234567892'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await h.repo.customerRepository.list(1)).length,3);
  assert.ok(h.db.retries>0);assert.ok(h.db.data.has('salons/1/customerPhones/'+h.store.digest('1234567892')));
});
test('queue joins serialize capacity, positions and duplicate membership',async()=> {
  const h=await fixture(1);
  const join=customerId=>h.store.runTransaction(async()=> {
    const next=await h.load('src/lib/salon-data.ts').nextQueuePosition(1);
    return h.repo.queueRepository.create(1,{...queueInput(customerId,'token-'+customerId),position:next});
  },1);
  const results=await Promise.allSettled([join(1),join(2)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await h.repo.queueRepository.list(1)).length,1);assert.ok(h.db.retries>0);
});
test('concurrent booking creation and rescheduling prevent staff overlaps',async()=> {
  const h=await fixture();
  const results=await Promise.allSettled([h.repo.bookingRepository.create(1,bookingInput(1,'book-1')),h.repo.bookingRepository.create(1,bookingInput(2,'book-2'))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const booked=(await h.repo.bookingRepository.list(1))[0];
  const other=booked.customerId===1?2:1;
  const [later]=await h.repo.bookingRepository.create(1,bookingInput(other,'book-later',new Date('2030-01-01T11:00:00Z')));
  await assert.rejects(h.repo.bookingRepository.update(1,h.query.eq(h.fields.bookings.id,later.id),{scheduledAt:booked.scheduledAt}),error=>error.status===409);
});
test('completion is idempotent under concurrent requests and totals commit once',async()=> {
  const h=await fixture();const [entry]=await h.repo.queueRepository.create(1,queueInput(1,'complete-token'));
  await Promise.all([h.repo.completeVisit(1,'queueEntries',entry.id),h.repo.completeVisit(1,'queueEntries',entry.id)]);
  const customer=(await h.repo.customerRepository.list(1))[0];
  assert.equal(customer.totalVisits,1);assert.equal(customer.totalSpend,250);assert.equal(customer.loyaltyPoints,5);
  assert.equal((await h.repo.visitRepository.list(1)).length,1);
});
test('a booking moved to the queue cannot be billed twice',async()=> {
  const h=await fixture();
  await h.store.runTransaction(async()=> {
    const [booking]=await h.repo.bookingRepository.create(1,bookingInput(1,'linked-booking'));
    const [queue]=await h.repo.queueRepository.create(1,queueInput(1,'linked-queue'));
    await h.repo.linkBookingQueue(1,booking.id,queue.id);
  },1);
  await h.repo.completeVisit(1,'queueEntries',1);await h.repo.completeVisit(1,'bookings',1);
  assert.equal((await h.repo.visitRepository.list(1)).length,1);
  assert.equal((await h.repo.customerRepository.list(1))[0].totalSpend,250);
});
test('validation errors discard customer creation and notification side effects',async()=> {
  const h=await fixture();let effects=0;
  const response=await h.store.runTransaction(async()=> {
    await h.repo.customerRepository.create(1,{name:'Tentative',phone:'1234567899'});
    await h.store.afterCommit(async()=>effects++);
    return Response.json({error:'Rejected'}, {status:409});
  },1);
  assert.equal(response.status,409);assert.equal((await h.repo.customerRepository.list(1)).length,2);assert.equal(effects,0);
});

test('effects from a conflicted attempt are discarded if its retry returns an error',async()=> {
  const h=await fixture();let effects=0;let attempts=0;
  const response=await h.store.runTransaction(async()=> {
    attempts++;
    if(attempts>1)return Response.json({error:'Retry rejected'}, {status:409});
    await h.repo.customerRepository.update(1,h.query.eq(h.fields.customers.id,1),{name:'Tentative change'});
    await h.store.afterCommit(async()=>effects++);
    // Simulate a competing commit after this attempt's state read.
    const key='salons/1/_meta/state';h.db.versions.set(key,(h.db.versions.get(key)??0)+1);
    return Response.json({ok:true});
  },1);
  assert.equal(response.status,409);assert.equal(attempts,2);assert.equal(effects,0);
  assert.equal((await h.repo.customerRepository.list(1))[0].name,'Test customer A');
});
test('transaction retries deliver Web Push only after one successful commit',async()=> {
  const h=await fixture();
  await h.repo.pushSubscriptionRepository.create(1,{customerId:1,endpoint:'https://push.example.invalid/1',p256dh:'test-key',auth:'test-auth'});
  const fn=()=>h.store.runTransaction(async()=> {
    await h.repo.customerRepository.update(1,h.query.eq(h.fields.customers.id,1),{lastActivityAt:new Date()});
    await h.load('src/lib/salon-data.ts').pushNotification({salonId:1,customerId:1,type:'queue',title:'Test',body:'Test notification'});
  },1);
  await Promise.all([fn(),fn()]);assert.ok(h.db.retries>0);
  assert.equal(h.db.pushes.length,2);assert.equal((await h.repo.notificationRepository.list(1)).length,2);
});
test('endpoint rotation resolves a tenant, rejects stale endpoints and preserves preferences',async()=> {
  const h=await fixture();const endpoint='https://push.example.invalid/old';
  await h.repo.pushSubscriptionRepository.create(1,{customerId:1,endpoint,p256dh:'test-key',auth:'test-auth',marketingOptIn:true});
  const rotate=h.load('src/lib/firestore/push-endpoints.ts').rotatePushEndpoint;
  assert.equal(await rotate(endpoint,{endpoint:'https://push.example.invalid/new',p256dh:'new-key',auth:'new-auth'}),true);
  assert.equal(await rotate(endpoint,{endpoint:'https://push.example.invalid/stale',p256dh:'stale-key',auth:'stale-auth'}),false);
  assert.equal((await h.repo.pushSubscriptionRepository.list(1))[0].marketingOptIn,true);
});
test('staff service links stay on staff docs and referenced services archive safely',async()=> {
  const h=await fixture();assert.deepEqual(h.db.data.get('salons/1/staff/1').serviceIds,[1]);
  const [booking]=await h.repo.bookingRepository.create(1,bookingInput(1,'history-booking'));
  await h.repo.serviceRepository.remove(1,h.query.eq(h.fields.services.id,1));
  assert.equal((await h.repo.serviceRepository.list(1))[0].active,false);assert.equal((await h.repo.bookingRepository.list(1))[0].id,booking.id);
});
test('GET catalogue does not mutate staff metadata or tenant counters',async()=> {
  const h=await fixture();const before=[...h.db.versions];
  await h.store.runTransaction(()=>h.load('src/lib/salon-data.ts').getCatalogue(1),1);
  assert.deepEqual([...h.db.versions],before);
});
test('owner routes preserve numeric IDs, response keys, completion and errors',async()=> {
  const h=await fixture();const route=h.load('src/app/api/owner/queue/route.ts');
  const post=await route.POST(new Request('https://hairq.example.invalid/api/owner/queue',{method:'POST',body:JSON.stringify({name:'Test customer A',phone:'1234567890',serviceId:1,staffId:1})}));
  assert.equal(post.status,201);const {entry}=await post.json();assert.equal(typeof entry.id,'number');assert.equal(entry.status,'waiting');
  const actions=h.load('src/app/api/owner/queue/[id]/route.ts');
  for(let i=0;i<2;i++) {
    const response=await actions.PATCH(new Request('https://hairq.example.invalid/api/owner/queue/1',{method:'PATCH',body:JSON.stringify({action:'complete'})}),{params:Promise.resolve({id:String(entry.id)})});
    assert.equal(response.status,200);
  }
  assert.equal((await h.repo.visitRepository.list(1)).length,1);
  const get=await route.GET();assert.equal(get.status,200);assert.equal((await get.json()).stats.servedToday,1);
});

test('all migrated owner GET endpoints retain their top-level response contracts',async()=> {
  const h=await fixture();
  for(const [relative,keys]of [
    ['salon',['salon','hours','offers','owner']],['services',['services','staff']],
    ['staff',['staff','services']],['customers',['customers','segments','staff','services']],
    ['bookings',['bookings','counts']],['campaigns',['campaigns','audience']],
    ['summary',['salon']],
  ]) {
    const route=h.load(`src/app/api/owner/${relative}/route.ts`);
    const response=await route.GET(new Request(`https://hairq.example.invalid/api/owner/${relative}`));
    assert.equal(response.status,200,relative);
    const body=await response.json();for(const key of keys)assert.ok(key in body,`${relative} must include ${key}`);
  }
  const detail=h.load('src/app/api/owner/customers/[id]/route.ts');
  const response=await detail.GET(new Request('https://hairq.example.invalid/api/owner/customers/1'),{params:Promise.resolve({id:'1'})});
  assert.equal(response.status,200);assert.equal((await response.json()).customer.id,1);
});
test('service/staff CRUD rejects relationships outside the tenant and commits atomically',async()=> {
  const h=await fixture();const route=h.load('src/app/api/owner/services/route.ts');
  const bad=await route.POST(new Request('https://hairq.example.invalid/api/owner/services',{method:'POST',body:JSON.stringify({name:'Bad link',durationMin:30,price:100,staffIds:[999]})}));
  assert.equal(bad.status,400);assert.equal((await h.repo.serviceRepository.list(1)).length,1);
  const good=await route.POST(new Request('https://hairq.example.invalid/api/owner/services',{method:'POST',body:JSON.stringify({name:'Second service',durationMin:20,price:100,staffIds:[1]})}));
  assert.equal(good.status,201);
  const staff=h.load('src/app/api/owner/staff/[id]/route.ts');
  const updated=await staff.PATCH(new Request('https://hairq.example.invalid/api/owner/staff/1',{method:'PATCH',body:JSON.stringify({serviceIds:[2]})}),{params:Promise.resolve({id:'1'})});
  assert.equal(updated.status,200);assert.deepEqual(h.db.data.get('salons/1/staff/1').serviceIds,[2]);
  await assert.rejects(h.repo.queueRepository.create(1,queueInput(1,'invalid-capability')),error=>error.status===400);
});
test('public queue and booking token endpoints preserve tenant-bound responses',async()=> {
  const h=await fixture();
  await h.repo.queueRepository.create(1,queueInput(1,'public-queue-token'));
  await h.repo.bookingRepository.create(1,bookingInput(2,'public-booking-token'));
  const queue=h.load('src/app/api/public/[slug]/queue/[token]/route.ts');
  const booking=h.load('src/app/api/public/[slug]/book/[token]/route.ts');
  const ctx=token=>({params:Promise.resolve({slug:'test-salon',token})});
  const queueResponse=await queue.GET(new Request('https://hairq.example.invalid/api/public/test-salon/queue/public-queue-token'),ctx('public-queue-token'));
  assert.equal(queueResponse.status,200);assert.equal((await queueResponse.json()).entry.customerId,1);
  const bookingResponse=await booking.GET(new Request('https://hairq.example.invalid/api/public/test-salon/book/public-booking-token'),ctx('public-booking-token'));
  assert.equal(bookingResponse.status,200);assert.ok('booking' in await bookingResponse.json());
  const cancelled=await queue.DELETE(new Request('https://hairq.example.invalid/api/public/test-salon/queue/public-queue-token',{method:'DELETE'}),ctx('public-queue-token'));
  assert.equal(cancelled.status,200);assert.equal((await h.repo.queueRepository.list(1))[0].status,'cancelled');
});
test('customer profile routes cannot set financial statistics and push keys are redacted',async()=> {
  const h=await fixture();const detail=h.load('src/app/api/owner/customers/[id]/route.ts');
  const response=await detail.PATCH(new Request('https://hairq.example.invalid/api/owner/customers/1',{method:'PATCH',body:JSON.stringify({totalSpend:999999,totalVisits:999})}),{params:Promise.resolve({id:'1'})});
  assert.equal(response.status,400);assert.equal((await h.repo.customerRepository.list(1))[0].totalSpend,0);
  await h.repo.pushSubscriptionRepository.create(1,{customerId:1,endpoint:'https://push.example.invalid/private',p256dh:'private-transport-key',auth:'private-transport-auth'});
  const notify=h.load('src/app/api/public/[slug]/notify/route.ts');
  const feed=await notify.GET(new Request('https://hairq.example.invalid/api/public/test-salon/notify?customerId=1'),{params:Promise.resolve({slug:'test-salon'})});
  const body=await feed.json();assert.equal(feed.status,200);assert.equal(body.pushReady,true);
  assert.equal(body.subscription.p256dh,null);assert.equal(body.subscription.auth,null);
});
test('campaign responses contain actual post-commit delivery counts',async()=> {
  const h=await fixture();
  await h.repo.pushSubscriptionRepository.create(1,{customerId:1,endpoint:'https://push.example.invalid/campaign',p256dh:'test-key',auth:'test-auth',marketingOptIn:true});
  const route=h.load('src/app/api/owner/campaigns/route.ts');
  const response=await route.POST(new Request('https://hairq.example.invalid/api/owner/campaigns',{method:'POST',body:JSON.stringify({title:'Test campaign',body:'Test message',segment:'all_opted_in'})}));
  assert.equal(response.status,201);const body=await response.json();
  assert.equal(body.delivery.sent,1);assert.equal(body.recipients,1);assert.equal(h.db.pushes.length,1);
});
test('phone changes reserve the new lookup and release the old lookup; duplicates roll back',async()=> {
  const h=await fixture();
  await h.repo.customerRepository.update(1,h.query.eq(h.fields.customers.id,1),{phone:'1234567800'});
  assert.ok(!h.db.data.has('salons/1/customerPhones/'+h.store.digest('1234567890')));
  assert.ok(h.db.data.has('salons/1/customerPhones/'+h.store.digest('1234567800')));
  await assert.rejects(h.repo.customerRepository.update(1,h.query.eq(h.fields.customers.id,2),{phone:'1234567800'}),error=>error.status===409);
  assert.equal((await h.repo.customerRepository.list(1))[1].phone,'1234567891');
});
test('customer deletion cascades nested subscriptions and operation/history records',async()=> {
  const h=await fixture();await h.repo.queueRepository.create(1,queueInput(1,'cascade-queue'));
  await h.repo.bookingRepository.create(1,bookingInput(1,'cascade-booking'));
  await h.repo.pushSubscriptionRepository.create(1,{customerId:1,endpoint:'https://push.example.invalid/cascade',p256dh:'test-key',auth:'test-auth'});
  await h.repo.customerRepository.remove(1,h.query.eq(h.fields.customers.id,1));
  assert.equal((await h.repo.customerRepository.list(1)).length,1);
  assert.equal((await h.repo.queueRepository.list(1)).length,0);assert.equal((await h.repo.bookingRepository.list(1)).length,0);
  assert.equal((await h.repo.pushSubscriptionRepository.list(1)).length,0);
  assert.ok(!h.db.data.has('pushEndpoints/'+h.store.digest('https://push.example.invalid/cascade')));
});
