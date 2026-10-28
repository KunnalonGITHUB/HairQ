import assert from "node:assert/strict";
import {test} from "node:test";
import {fixture,harness} from "./support/firestore-harness.mjs";

/* ---------------------------------------------------------------- helpers */

// All expectations are written in salon time (Asia/Kolkata), so this file
// must pass whatever timezone the machine running it is in.
const availability=()=>harness().load('src/lib/availability.ts');
const salonTime=harness().load('src/lib/salon-time.ts');
const {salonDayStart,salonTimeOnDay,salonDateKey,salonClock,salonWeekday,addDaysToKey}=salonTime;
const DAY=salonDayStart('2030-01-02');
const at=(h,m)=>salonTimeOnDay('2030-01-02',h*60+m);
const hm=iso=>{const c=salonClock(new Date(iso));return `${String(c.hour).padStart(2,'0')}:${String(c.minute).padStart(2,'0')}`;};
const member=(id,shiftStart='10:00',shiftEnd='21:00')=>({id,name:'Barber '+id,active:true,shiftStart,shiftEnd});
function slots(overrides={}) {
  // Copy out of the harness VM realm so strict deep-equal compares plain arrays.
  return Array.from(rawSlots(overrides));
}
function rawSlots({hours,...overrides}={}) {
  const {buildSlots}=availability();
  return buildSlots({
    day:DAY,
    hours:{dayOfWeek:salonWeekday(DAY),isClosed:false,openTime:'10:00',closeTime:'13:00',breakStart:null,breakEnd:null,...hours},
    durationMin:30,staff:[member(1)],staffServiceMap:new Map(),serviceId:1,bookings:[],preferredStaffId:null,
    now:salonTimeOnDay('2030-01-01',12*60),...overrides,
  });
}

/** Salon midnight `n` salon days from today. */
const salonDay=n=>salonDayStart(addDaysToKey(salonDateKey(new Date()),n));
const tomorrow=()=>salonDay(1);
const key=d=>salonDateKey(d);
const timeOn=(day,h,m)=>salonTimeOnDay(salonDateKey(day),h*60+m);
const ctx={params:Promise.resolve({slug:'test-salon'})};
const BASE='https://hairq.example.invalid/api/public/test-salon/book';

function publicBooking(h) {
  const route=h.load('src/app/api/public/[slug]/book/route.ts');
  return {
    async get(day,{serviceId=1,staffId}={}) {
      const params=new URLSearchParams({serviceId:String(serviceId),date:key(day)});
      if(staffId)params.set('staffId',String(staffId));
      const response=await route.GET(new Request(`${BASE}?${params}`),ctx);
      assert.equal(response.status,200);
      return (await response.json()).slots;
    },
    async post(when,{phone,serviceId=1,staffId=null,name='Customer'}) {
      const response=await route.POST(new Request(BASE,{method:'POST',body:JSON.stringify({name,phone,serviceId,staffId,scheduledAt:when.toISOString()})}),ctx);
      return {status:response.status,body:await response.json()};
    },
  };
}
const slotAt=(list,when)=>list.find(s=>new Date(s.time).getTime()===when.getTime());

/* ------------------------------------------------- slot generation (pure) */

test('slots are generated every 30 minutes on the clock grid',()=> {
  const list=slots();
  assert.deepEqual(list.map(s=>hm(s.time)),['10:00','10:30','11:00','11:30','12:00','12:30']);
  assert.deepEqual(list.slice(0,3).map(s=>s.label),['10:00 AM','10:30 AM','11:00 AM']);
  assert.ok(list.every(s=>s.available&&salonClock(new Date(s.time)).minute%30===0));
  assert.equal(availability().SLOT_INTERVAL_MIN,30);
});
test('service duration limits the last start time without leaving the grid',()=> {
  assert.deepEqual(slots({durationMin:45}).map(s=>hm(s.time)),['10:00','10:30','11:00','11:30','12:00']);
  assert.deepEqual(slots({durationMin:90}).map(s=>hm(s.time)),['10:00','10:30','11:00','11:30']);
  assert.deepEqual(slots({durationMin:180}).map(s=>hm(s.time)),['10:00']);
  assert.deepEqual(slots({durationMin:240}),[]);
});
test('odd opening/closing times, breaks, shifts, closed days and lead time are respected',()=> {
  assert.deepEqual(slots({hours:{openTime:'10:15',closeTime:'12:45'}}).map(s=>hm(s.time)),['10:30','11:00','11:30','12:00']);
  assert.deepEqual(slots({hours:{breakStart:'11:00',breakEnd:'11:30'}}).map(s=>hm(s.time)),['10:00','10:30','11:30','12:00','12:30']);
  assert.deepEqual(slots({durationMin:60,hours:{breakStart:'11:00',breakEnd:'11:30'}}).map(s=>hm(s.time)),['10:00','11:30','12:00']);
  assert.deepEqual(slots({staff:[member(1,'11:00','12:00')]}).map(s=>hm(s.time)),['11:00','11:30']);
  assert.deepEqual(slots({hours:{isClosed:true}}),[]);
  assert.deepEqual(slots({now:at(10,20)}).map(s=>hm(s.time)),['11:00','11:30','12:00','12:30']);
});
test('booked times stay in the list but are marked unavailable for that barber',()=> {
  const booking={id:1,staffId:1,scheduledAt:at(11,0),durationMin:30,status:'confirmed'};
  const one=slots({staff:[member(1),member(2)],bookings:[booking],preferredStaffId:1});
  const eleven=one.find(s=>hm(s.time)==='11:00');
  assert.equal(eleven.available,false);assert.deepEqual(eleven.staffIds,[]);
  assert.ok(one.filter(s=>hm(s.time)!=='11:00').every(s=>s.available));
  // "Anyone" still offers the slot while another barber is free.
  const any=slots({staff:[member(1),member(2)],bookings:[booking]}).find(s=>hm(s.time)==='11:00');
  assert.equal(any.available,true);assert.deepEqual(any.staffIds,[2]);
  // A longer service starting earlier overlaps the booking.
  const long=slots({durationMin:45,bookings:[booking],preferredStaffId:1});
  assert.equal(long.find(s=>hm(s.time)==='10:30').available,false);
  assert.equal(long.find(s=>hm(s.time)==='11:30').available,true);
  // Cancelled bookings free the slot; unassigned bookings block every barber.
  assert.ok(slots({bookings:[{...booking,status:'cancelled'}]}).every(s=>s.available));
  assert.equal(slots({staff:[member(1),member(2)],bookings:[{...booking,staffId:null}]}).find(s=>hm(s.time)==='11:00').available,false);
});
test('isOnSlotGrid only accepts :00 and :30 starts',()=> {
  const {isOnSlotGrid}=availability();
  assert.equal(isOnSlotGrid(at(16,0)),true);assert.equal(isOnSlotGrid(at(16,30)),true);
  assert.equal(isOnSlotGrid(at(16,15)),false);assert.equal(isOnSlotGrid(at(16,45)),false);
  assert.equal(isOnSlotGrid(new Date(at(16,30).getTime()+1000)),false);
});

/* ------------------------------------------- shared booking via the API */

test('customer A books 4:30 PM; customer B then sees it booked and cannot take it',async()=> {
  const h=await fixture();const api=publicBooking(h);const day=tomorrow();const slot=timeOn(day,16,30);
  assert.equal(slotAt(await api.get(day,{staffId:1}),slot).available,true);
  const a=await api.post(slot,{phone:'9876500001',staffId:1,name:'Customer A'});
  assert.equal(a.status,201);
  // Customer B: a separate request reading the shared database.
  const seen=await api.get(day,{staffId:1});
  assert.equal(slotAt(seen,slot).available,false);
  assert.equal(slotAt(seen,timeOn(day,16,0)).available,true);assert.equal(slotAt(seen,timeOn(day,17,0)).available,true);
  assert.equal(slotAt(await api.get(day),slot).available,false);
  const b=await api.post(slot,{phone:'9876500002',staffId:1,name:'Customer B'});
  assert.equal(b.status,409);assert.match(b.body.error,/just taken/);
  assert.equal((await api.post(slot,{phone:'9876500002',name:'Customer B'})).status,409);
  const stored=await h.repo.bookingRepository.list(1);
  assert.equal(stored.length,1);assert.equal(stored[0].scheduledAt.getTime(),slot.getTime());assert.equal(stored[0].staffId,1);
  // The confirmation screen reads back the same stored time.
  const confirm=h.load('src/app/api/public/[slug]/book/[token]/route.ts');
  const response=await confirm.GET(new Request(`${BASE}/${a.body.token}`),{params:Promise.resolve({slug:'test-salon',token:a.body.token})});
  assert.equal(new Date((await response.json()).booking.scheduledAt).getTime(),slot.getTime());
});
test('two customers booking the same barber at the same moment: exactly one succeeds',async()=> {
  const h=await fixture();const api=publicBooking(h);const slot=timeOn(tomorrow(),16,30);
  const results=await Promise.all([api.post(slot,{phone:'9876500011',staffId:1}),api.post(slot,{phone:'9876500012',staffId:1})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  assert.equal((await h.repo.bookingRepository.list(1)).length,1);
  assert.ok(h.db.retries>0,'the losing request must have been retried inside a transaction');
});
test('overlapping durations are rejected and blocked across services',async()=> {
  const h=await fixture();const day=tomorrow();
  const [long]=await h.repo.serviceRepository.create(1,{name:'Colour',price:900,durationMin:60});
  await h.repo.staffServiceRepository.create(1,{staffId:1,serviceId:long.id});
  const api=publicBooking(h);
  assert.equal((await api.post(timeOn(day,16,0),{phone:'9876500021',serviceId:long.id})).status,201);
  const seen=await api.get(day);
  assert.equal(slotAt(seen,timeOn(day,16,0)).available,false);
  assert.equal(slotAt(seen,timeOn(day,16,30)).available,false);
  assert.equal(slotAt(seen,timeOn(day,17,0)).available,true);
  assert.equal(slotAt(await api.get(day,{serviceId:long.id}),timeOn(day,15,30)).available,false);
  assert.equal((await api.post(timeOn(day,16,30),{phone:'9876500022'})).status,409);
  assert.equal((await api.post(timeOn(day,15,30),{phone:'9876500022',serviceId:long.id})).status,409);
  assert.equal((await api.post(timeOn(day,17,0),{phone:'9876500022'})).status,201);
});
test('availability is per barber; "Anyone" is assigned the free barber',async()=> {
  const h=await fixture();const day=tomorrow();const slot=timeOn(day,16,30);
  const [second]=await h.repo.staffRepository.create(1,{name:'Second barber'});
  await h.repo.staffServiceRepository.create(1,{staffId:second.id,serviceId:1});
  const api=publicBooking(h);
  assert.equal((await api.post(slot,{phone:'9876500031',staffId:1})).status,201);
  assert.equal(slotAt(await api.get(day,{staffId:1}),slot).available,false);
  assert.equal(slotAt(await api.get(day,{staffId:second.id}),slot).available,true);
  const any=slotAt(await api.get(day),slot);
  assert.equal(any.available,true);assert.deepEqual(any.staffIds,[second.id]);
  assert.equal((await api.post(slot,{phone:'9876500032'})).status,201);
  assert.equal((await h.repo.bookingRepository.list(1)).find(b=>b.scheduledAt.getTime()===slot.getTime()&&b.staffId===second.id)!==undefined,true);
  assert.equal(slotAt(await api.get(day),slot).available,false);
  assert.equal((await api.post(slot,{phone:'9876500033'})).status,409);
});
test('API slots are 30 minutes apart on every date and off-grid times are rejected',async()=> {
  const h=await fixture();const api=publicBooking(h);
  for(let offset=1;offset<=3;offset++) {
    const day=salonDay(offset);
    const list=await api.get(day);
    assert.equal(list.length,22);// 10:00 to 20:30 within the default 10:00 to 21:00 shift
    assert.equal(hm(list[0].time),'10:00');assert.equal(hm(list.at(-1).time),'20:30');
    list.slice(1).forEach((s,i)=>assert.equal(new Date(s.time)-new Date(list[i].time),30*60000));
  }
  const day=tomorrow();
  for(const minute of [15,45]) {
    const response=await api.post(timeOn(day,16,minute),{phone:'9876500041'});
    assert.equal(response.status,400);assert.match(response.body.error,/isn't available/);
  }
  assert.equal((await h.repo.bookingRepository.list(1)).length,0);
});
test('slot API follows the salon working hours and breaks',async()=> {
  const h=await fixture();const day=tomorrow();
  const {eq,and}=h.query;const wh=h.fields.workingHours;
  await h.repo.workingHoursRepository.update(1,and(eq(wh.salonId,1),eq(wh.dayOfWeek,salonWeekday(day))),{openTime:'10:15',closeTime:'13:00',breakStart:'11:00',breakEnd:'11:30'});
  const api=publicBooking(h);
  assert.deepEqual((await api.get(day)).map(s=>hm(s.time)),['10:30','11:30','12:00','12:30']);
  assert.equal((await api.post(timeOn(day,11,0),{phone:'9876500051'})).status,400);
  await h.repo.workingHoursRepository.update(1,and(eq(wh.salonId,1),eq(wh.dayOfWeek,salonWeekday(day))),{isClosed:true});
  assert.deepEqual(await api.get(day),[]);
});

/* -------------------------------------------------------- owner screens */

test('owner bookings and reschedules use the same 30-minute grid',async()=> {
  const h=await fixture();const day=tomorrow();
  const create=h.load('src/app/api/owner/bookings/route.ts');
  const post=when=>create.POST(new Request('https://hairq.example.invalid/api/owner/bookings',{method:'POST',body:JSON.stringify({name:'Phone caller',phone:'9876500061',serviceId:1,staffId:1,scheduledAt:when.toISOString()})}));
  assert.equal((await post(timeOn(day,16,15))).status,400);
  const made=await post(timeOn(day,16,30));assert.equal(made.status,201);
  const {booking}=await made.json();
  const actions=h.load('src/app/api/owner/bookings/[id]/route.ts');
  const move=when=>actions.PATCH(new Request(`https://hairq.example.invalid/api/owner/bookings/${booking.id}`,{method:'PATCH',body:JSON.stringify({action:'reschedule',scheduledAt:when.toISOString()})}),{params:Promise.resolve({id:String(booking.id)})});
  assert.equal((await move(timeOn(day,17,45))).status,400);
  assert.equal((await move(timeOn(day,17,0))).status,200);
  assert.equal((await h.repo.bookingRepository.list(1))[0].scheduledAt.getTime(),timeOn(day,17,0).getTime());
  // The owner's booking is shared with customers too.
  assert.equal(slotAt(await publicBooking(h).get(day,{staffId:1}),timeOn(day,17,0)).available,false);
});

/* ------------------------------------------ Asia/Kolkata end to end */

test('salon clock helpers convert between instants and Asia/Kolkata wall time',()=> {
  const t=salonTime;
  assert.equal(t.SALON_TIME_ZONE,'Asia/Kolkata');
  assert.equal(t.salonDayStart('2030-01-02').toISOString(),'2030-01-01T18:30:00.000Z');
  assert.equal(t.salonTimeOnDay('2030-01-02',16*60+30).toISOString(),'2030-01-02T11:00:00.000Z');
  const midnight=t.salonClock(new Date('2030-01-01T18:30:00Z'));
  assert.deepEqual([midnight.year,midnight.month,midnight.day,midnight.hour,midnight.minute,midnight.weekday],[2030,1,2,0,0,3]);
  assert.equal(t.salonDateKey(new Date('2030-01-01T18:29:59Z')),'2030-01-01');
  assert.equal(t.salonDateKey(new Date('2030-01-01T18:30:00Z')),'2030-01-02');
  assert.equal(t.salonEndOfDay(new Date('2030-01-02T11:00:00Z')).toISOString(),'2030-01-02T18:29:59.999Z');
  assert.equal(t.addDaysToKey('2030-12-31',1),'2031-01-01');
  assert.equal(t.isSalonDateKey('2030-02-29'),false);assert.equal(t.isSalonDateKey('2032-02-29'),true);assert.equal(t.isSalonDateKey('bad'),false);
  assert.equal(t.formatSalonTime(new Date('2030-01-02T11:00:00Z')),'4:30 PM');
  assert.equal(t.formatSalonDate(new Date('2030-01-01T19:00:00Z'),{weekday:'long'}),'Wednesday');
  assert.equal(t.toSalonInputValue(new Date('2030-01-02T11:00:00Z')),'2030-01-02T16:30');
  assert.equal(t.fromSalonInputValue('2030-01-02T16:30').toISOString(),'2030-01-02T11:00:00.000Z');
  assert.equal(t.fromSalonInputValue('2030-01-02T25:00'),null);assert.equal(t.fromSalonInputValue(''),null);
  assert.equal(t.nextSalonHalfHour(new Date('2030-01-02T10:41:10Z')).toISOString(),'2030-01-02T11:00:00.000Z');// 4:11 PM -> 4:30 PM
  assert.equal(t.nextSalonHalfHour(new Date('2030-01-02T11:00:00Z')).toISOString(),'2030-01-02T11:00:00.000Z');
  assert.equal(t.nextSalonHalfHour(new Date('2030-01-02T18:20:00Z')).toISOString(),'2030-01-02T18:30:00.000Z');// 11:50 PM -> midnight
  // 1:30 AM IST on 2 Jan is still 1 Jan in UTC; for the salon both times are the same day.
  assert.equal(t.relativeSalonDay(new Date('2030-01-02T05:00:00Z'),new Date('2030-01-01T20:00:00Z')),'Today');
  assert.equal(t.relativeSalonDay(new Date('2030-01-02T19:00:00Z'),new Date('2030-01-01T20:00:00Z')),'Tomorrow');
});
test('slots are Asia/Kolkata wall-clock times stored as exact instants',()=> {
  const list=slots();
  assert.equal(list[0].time,'2030-01-02T04:30:00.000Z');// 10:00 AM IST
  assert.equal(list[0].label,'10:00 AM');
  const {isOnSlotGrid}=availability();
  assert.equal(isOnSlotGrid(new Date('2030-01-02T11:00:00Z')),true);// 4:30 PM IST
  assert.equal(isOnSlotGrid(new Date('2030-01-02T10:45:00Z')),false);// 4:15 PM IST
});
test('booking API days, slots, storage, window and notification text use salon time',async()=> {
  const h=await fixture();const api=publicBooking(h);const day=tomorrow();
  const route=h.load('src/app/api/public/[slug]/book/route.ts');
  const body=await (await route.GET(new Request(`${BASE}?serviceId=1&date=${key(day)}`),ctx)).json();
  assert.equal(body.date,key(day));
  assert.equal(body.days[0].date,salonDateKey(new Date()));assert.equal(body.days[1].date,key(day));
  assert.equal(body.days[1].dayNum,salonClock(day).day);
  assert.equal(body.days[1].weekday,salonTime.formatSalonDate(day,{weekday:'short'}));
  assert.equal(body.slots[0].label,'10:00 AM');assert.equal(body.slots[0].time,timeOn(day,10,0).toISOString());
  // A malformed date falls back to today instead of an invalid day.
  assert.equal((await (await route.GET(new Request(`${BASE}?serviceId=1&date=bad`),ctx)).json()).date,salonDateKey(new Date()));
  const slot=timeOn(day,16,30);
  assert.equal((await api.post(slot,{phone:'9876500071',staffId:1})).status,201);
  assert.equal(h.db.data.get('salons/1/bookings/1').scheduledAt.toDate().toISOString(),slot.toISOString());
  const note=(await h.repo.notificationRepository.list(1)).at(-1);
  assert.match(note.body,/ at 4:30 PM\./);
  assert.ok(note.body.includes(salonTime.formatSalonDate(slot,{weekday:'long'})));
  // The window ends at salon midnight after the last bookable day (default 14 days).
  const lastKey=addDaysToKey(salonDateKey(new Date()),13);
  assert.equal((await api.post(salonTimeOnDay(lastKey,16*60+30),{phone:'9876500072'})).status,201);
  const outside=await api.post(salonTimeOnDay(addDaysToKey(lastKey,1),10*60),{phone:'9876500073'});
  assert.equal(outside.status,400);assert.match(outside.body.error,/booking window/);
});
test('owner Today/Upcoming lists and the dashboard count use salon days',async()=> {
  const h=await fixture();const todayKey=salonDateKey(new Date());
  // 2:00 AM IST today is still the previous day in UTC; 3:00 AM IST tomorrow is today in UTC.
  await h.repo.bookingRepository.create(1,{customerId:1,serviceId:1,staffId:1,token:'early-today',scheduledAt:salonTimeOnDay(todayKey,2*60)});
  await h.repo.bookingRepository.create(1,{customerId:2,serviceId:1,staffId:1,token:'early-tomorrow',scheduledAt:salonTimeOnDay(addDaysToKey(todayKey,1),3*60)});
  const route=h.load('src/app/api/owner/bookings/route.ts');
  const list=async scope=>(await route.GET(new Request(`https://hairq.example.invalid/api/owner/bookings?scope=${scope}`))).json();
  const today=await list('today');
  assert.deepEqual(Array.from(today.bookings,b=>b.token),['early-today']);
  assert.deepEqual(Array.from((await list('upcoming')).bookings,b=>b.token),['early-tomorrow']);
  assert.equal(today.counts.today,1);assert.equal(today.counts.upcoming,1);
  const summary=h.load('src/app/api/owner/summary/route.ts');
  assert.equal((await (await summary.GET(new Request('https://hairq.example.invalid/api/owner/summary'))).json()).today.bookings,1);
});
