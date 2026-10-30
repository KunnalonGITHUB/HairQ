import assert from "node:assert/strict";
import {test} from "node:test";
import {fixture} from "./support/firestore-harness.mjs";

// In-memory Firestore only. Fixture service #1 "Test service" costs 250.
async function setup() {
  const h=await fixture();
  await h.repo.serviceRepository.create(1,[{name:'Beard Trim',price:120,durationMin:15},{name:'Old colour',price:900,durationMin:60,active:false}]);
  const [booking]=await h.repo.bookingRepository.create(1,{customerId:1,serviceId:1,staffId:1,token:'complete-me',scheduledAt:new Date('2030-01-02T11:00:00Z')});
  const route=h.load('src/app/api/owner/bookings/[id]/route.ts');
  const complete=(extraServices,id=booking.id)=>route.PATCH(new Request(`https://hairq.example.invalid/api/owner/bookings/${id}`,{method:'PATCH',body:JSON.stringify({action:'complete',...(extraServices?{extraServices}:{})})}),{params:Promise.resolve({id:String(id)})});
  const state=async()=>({
    booking:(await h.repo.bookingRepository.list(1)).find(b=>b.id===booking.id),
    visits:await h.repo.visitRepository.list(1),
    customer:(await h.repo.customerRepository.list(1)).find(c=>c.id===1),
  });
  return {h,booking,complete,state};
}

test('completion adds menu and custom services; menu prices come from the server',async()=> {
  const {complete,state}=await setup();
  // The client-sent price on a menu service is ignored; 120 is read from the menu.
  const response=await complete([{serviceId:2,price:1},{name:'Head massage',price:150}]);
  assert.equal(response.status,200);
  const {booking,visits,customer}=await state();
  assert.equal(booking.status,'completed');
  assert.equal(booking.finalAmount,520);
  assert.deepEqual(Array.from(booking.extraServices,x=>({...x})),[{serviceId:2,name:'Beard Trim',price:120},{serviceId:null,name:'Head massage',price:150}]);
  assert.equal(visits.length,1);assert.equal(visits[0].amount,520);assert.equal(visits[0].source,'booking');
  assert.equal(customer.totalSpend,520);assert.equal(customer.totalVisits,1);assert.equal(customer.loyaltyPoints,10);
});
test('completing twice, or at the same moment, records revenue exactly once',async()=> {
  const {complete,state}=await setup();
  const [a,b]=await Promise.all([complete([{name:'Wash',price:100}]),complete([{name:'Wash',price:100}])]);
  assert.deepEqual([a.status,b.status],[200,200]);
  assert.equal((await complete([{name:'Wash',price:100}])).status,200);
  const {booking,visits,customer}=await state();
  assert.equal(visits.length,1);assert.equal(visits[0].amount,350);
  assert.equal(customer.totalSpend,350);assert.equal(booking.finalAmount,350);
});
test('invalid extras are rejected and nothing is saved',async()=> {
  const {complete,state}=await setup();
  for(const bad of [[{serviceId:3}],[{serviceId:999}],[{name:'',price:100}],[{name:'Tip',price:-5}],[{name:'Tip',price:10.5}],[{name:'Tip'}],Array.from({length:21},()=>({name:'x',price:1}))]) {
    const response=await complete(bad);
    assert.equal(response.status,400,JSON.stringify(bad).slice(0,60));
  }
  const {booking,visits,customer}=await state();
  assert.equal(booking.status,'confirmed');assert.equal(booking.finalAmount,null);assert.equal(booking.extraServices,null);
  assert.equal(visits.length,0);assert.equal(customer.totalSpend,0);
});
test('completing without extras behaves as before and records the booked price',async()=> {
  const {complete,state}=await setup();
  assert.equal((await complete()).status,200);
  const {booking,visits}=await state();
  assert.equal(visits[0].amount,250);assert.equal(booking.finalAmount,250);assert.equal(booking.extraServices.length,0);
});
test('the bookings list, dashboard revenue and older records all work with the new fields',async()=> {
  const {h,complete}=await setup();
  // An appointment stored before this feature has neither field and must still load.
  await h.repo.bookingRepository.create(1,{customerId:2,serviceId:1,staffId:1,token:'older',scheduledAt:new Date('2030-01-03T11:00:00Z')});
  const older=h.db.data.get('salons/1/bookings/2');delete older.extraServices;delete older.finalAmount;
  await complete([{serviceId:2}]);
  const list=h.load('src/app/api/owner/bookings/route.ts');
  const completed=await (await list.GET(new Request('https://hairq.example.invalid/api/owner/bookings?scope=completed'))).json();
  assert.equal(completed.bookings.length,1);
  assert.equal(completed.bookings[0].finalAmount,370);assert.equal(completed.bookings[0].extraServices[0].name,'Beard Trim');
  const upcoming=(await h.repo.bookingRepository.list(1)).find(b=>b.token==='older');
  assert.equal(upcoming.finalAmount,null);assert.equal(upcoming.extraServices,null);
  const summary=h.load('src/app/api/owner/summary/route.ts');
  assert.equal((await (await summary.GET(new Request('https://hairq.example.invalid/api/owner/summary'))).json()).today.revenue,370);
});
test('queue completion is unchanged and refuses extras',async()=> {
  const {h}=await setup();
  const [entry]=await h.repo.queueRepository.create(1,{customerId:2,serviceId:1,staffId:1,token:'queue-1',position:1});
  await assert.rejects(h.repo.completeVisit(1,'queueEntries',entry.id,[{name:'Tip',price:10}]),error=>error.status===400);
  await h.repo.completeVisit(1,'queueEntries',entry.id);
  assert.equal((await h.repo.visitRepository.list(1))[0].amount,250);
});
