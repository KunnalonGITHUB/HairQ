import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, harness, TestTimestamp } from "./support/firestore-harness.mjs";

function environment() {
  const values=new Map(), revoked=new Set(), calls=[];
  const cookies={get:name=>values.has(name)?{value:values.get(name).value}:undefined,set:(name,value,options)=>values.set(name,{value,options}),delete:name=>values.delete(name)};
  const claims={uid:'test-uid',auth_time:Date.now()/1000,firebase:{sign_in_provider:'password'}};
  const invalid=()=>Object.assign(new Error('private SDK details'),{code:'auth/invalid-session-cookie'});
  const adminAuth={
    verifyIdToken:async(token,check)=>{calls.push(['verifyIdToken',check]);if(token!=='valid')throw invalid();return claims;},
    getUser:async uid=>({uid,email:'operator@example.invalid',disabled:false}),
    createSessionCookie:async(token,options)=>{calls.push(['createSessionCookie',options]);return 'firebase-cookie';},
    verifySessionCookie:async(token,check)=>{calls.push(['verifySessionCookie',check]);if(token!=='firebase-cookie'||revoked.has(claims.uid))throw invalid();return claims;},
    revokeRefreshTokens:async uid=>{revoked.add(uid);calls.push(['revokeRefreshTokens',uid]);},
  };
  return {realAuth:true,cookies,values,claims,adminAuth,calls};
}
function profile(h,patch={}) {
  h.db.data.set('users/test-uid',{uid:'test-uid',email:'operator@example.invalid',name:'Test operator',role:'owner',salonId:'1',staffId:null,active:true,createdAt:TestTimestamp.now(),updatedAt:TestTimestamp.now(),legacyOwnerId:1,...patch});
}
function signedIn(e) {e.cookies.set('hq_firebase_session','firebase-cookie',{});}
async function mutation(h,e,url,body,method='POST',origin='https://hairq.example.invalid') {
  const token=await h.load('src/lib/auth-csrf.ts').issueAuthCsrf(new Request('https://hairq.example.invalid/api/auth'));
  return new Request('https://hairq.example.invalid'+url,{method,headers:{Origin:origin,'X-HairQ-CSRF':token,'Content-Type':'application/json'},body:JSON.stringify(body)});
}
test('unauthenticated and legacy-only sessions cannot access an owner API; public APIs stay public',async()=> {
  const e=environment(),h=await fixture(20,e);e.cookies.set('hq_session','obsolete-auth-cookie',{});
  assert.equal((await h.load('src/app/api/owner/services/route.ts').GET()).status,401);
  const response=await h.load('src/app/api/public/[slug]/route.ts').GET(new Request('https://hairq.example.invalid/api/public/test-salon'),{params:Promise.resolve({slug:'test-salon'})});
  assert.equal(response.status,200);
});
test('valid cookie verifies revocation and returns tenant data without public caching; invalid token denied',async()=> {
  const e=environment(),h=await fixture(20,e);profile(h);signedIn(e);
  const route=h.load('src/app/api/owner/services/route.ts');
  const response=await route.GET();assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/);
  assert.ok(e.calls.some(([name,check])=>name==='verifySessionCookie'&&check===true));
  e.cookies.set('hq_firebase_session','invalid',{});assert.equal((await route.GET()).status,401);
});
test('wrong salon in query or body is rejected, correct salon is allowed',async()=> {
  const e=environment(),h=await fixture(20,e);profile(h);signedIn(e);
  const summary=h.load('src/app/api/owner/summary/route.ts');
  assert.equal((await summary.GET(new Request('https://hairq.example.invalid/api/owner/summary?salonId=2'))).status,403);
  const services=h.load('src/app/api/owner/services/route.ts');
  assert.equal((await services.POST(await mutation(h,e,'/api/owner/services',{salonId:2,name:'Forbidden',price:10,durationMin:30}))).status,403);
  assert.equal((await services.POST(await mutation(h,e,'/api/owner/services',{salonId:1,name:'Allowed',price:10,durationMin:30}))).status,201);
});
test('existing operator roles allowed; customers, inactive and unprovisioned profiles denied',async()=> {
  const e=environment(),h=await fixture(20,e);signedIn(e);const route=h.load('src/app/api/owner/services/route.ts');
  for(const role of ['owner','manager','front_desk']){profile(h,{role});assert.equal((await route.GET()).status,200);}
  profile(h,{role:'customer'});assert.equal((await route.GET()).status,403);
  profile(h,{active:false});assert.equal((await route.GET()).status,403);
  h.db.data.delete('users/test-uid');assert.equal((await route.GET()).status,403);
});
test('login exchanges a verified recent token for an HttpOnly cookie; invalid and stale tokens denied',async()=> {
  const e=environment(),h=await fixture(20,e);profile(h);const route=h.load('src/app/api/auth/route.ts');
  const response=await route.POST(await mutation(h,e,'/api/auth',{action:'login',idToken:'valid',uid:'attacker',salonId:2,role:'owner'}));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,slug:'test-salon'});
  const cookie=e.values.get('hq_firebase_session');assert.equal(cookie.options.httpOnly,true);assert.equal(cookie.options.sameSite,'lax');assert.equal(cookie.options.maxAge,14*86400);
  assert.ok(e.calls.some(([name,check])=>name==='verifyIdToken'&&check===true));
  assert.equal((await route.POST(await mutation(h,e,'/api/auth',{action:'login',idToken:'invalid'}))).status,401);
  e.claims.auth_time-=600;assert.equal((await route.POST(await mutation(h,e,'/api/auth',{action:'login',idToken:'valid'}))).status,401);
});
test('logout revokes Firebase sessions and clears current and legacy cookies',async()=> {
  const e=environment(),h=await fixture(20,e);profile(h);signedIn(e);e.cookies.set('hq_session','retained-legacy-session',{});
  const response=await h.load('src/app/api/auth/route.ts').POST(await mutation(h,e,'/api/auth',{action:'logout'}));
  assert.equal(response.status,200);assert.equal(e.cookies.get('hq_firebase_session'),undefined);assert.equal(e.cookies.get('hq_session'),undefined);
  assert.ok(e.calls.some(([name,uid])=>name==='revokeRefreshTokens'&&uid==='test-uid'));
  signedIn(e);assert.equal((await h.load('src/app/api/owner/services/route.ts').GET()).status,401);
});
test('cross-origin and missing CSRF requests cannot login or mutate an owner API',async()=> {
  const e=environment(),h=await fixture(20,e);profile(h);signedIn(e);const auth=h.load('src/app/api/auth/route.ts');
  assert.equal((await auth.POST(await mutation(h,e,'/api/auth',{action:'login',idToken:'valid'},'POST','https://attacker.example.invalid'))).status,403);
  const request=new Request('https://hairq.example.invalid/api/owner/services',{method:'POST',headers:{Origin:'https://hairq.example.invalid'},body:'{"name":"forbidden"}'});
  assert.equal((await h.load('src/app/api/owner/services/route.ts').POST(request)).status,403);
});

test('CSRF accepts the browser Host when Next.js has an internal request URL, while rejecting other origins',async()=>{
  const e=environment(),h=await fixture(20,e),csrf=h.load('src/lib/auth-csrf.ts');
  const token=await csrf.issueAuthCsrf(new Request('http://internal:3100/api/auth',{headers:{Host:'127.0.0.1:3100',Origin:'http://127.0.0.1:3100'}}));
  await csrf.assertAuthMutation(new Request('http://internal:3100/api/auth',{method:'POST',headers:{Host:'127.0.0.1:3100',Origin:'http://127.0.0.1:3100','X-HairQ-CSRF':token}}));
  await assert.rejects(csrf.assertAuthMutation(new Request('http://internal:3100/api/auth',{method:'POST',headers:{Host:'127.0.0.1:3100',Origin:'https://attacker.example.invalid','X-HairQ-CSRF':token}})),error=>error.status===403);
});

test('disabled Auth accounts and non-password sign-ins cannot establish sessions',async()=> {
  const e=environment(),h=await fixture(20,e);profile(h);const route=h.load('src/app/api/auth/route.ts');
  e.adminAuth.getUser=async uid=>({uid,email:'operator@example.invalid',disabled:true});
  assert.equal((await route.POST(await mutation(h,e,'/api/auth',{action:'login',idToken:'valid'}))).status,403);
  assert.equal(e.cookies.get('hq_firebase_session'),undefined);
  e.adminAuth.getUser=async uid=>({uid,email:'operator@example.invalid',disabled:false});
  e.claims.firebase.sign_in_provider='google.com';
  assert.equal((await route.POST(await mutation(h,e,'/api/auth',{action:'login',idToken:'valid'}))).status,401);
});

test('logout failure clears local cookies and reports sanitized failure instead of success',async()=> {
  const e=environment(),h=await fixture(20,e);profile(h);signedIn(e);
  e.adminAuth.revokeRefreshTokens=async()=>{throw Error('private credential and SDK internals');};
  const response=await h.load('src/app/api/auth/route.ts').POST(await mutation(h,e,'/api/auth',{action:'logout'}));
  assert.equal(response.status,500);assert.ok(!JSON.stringify(await response.json()).includes('private credential'));
  assert.equal(e.cookies.get('hq_firebase_session'),undefined);
  assert.equal((await h.load('src/app/api/owner/services/route.ts').GET(new Request('https://hairq.example.invalid/api/owner/services'))).status,401);
});
test('signup provisions one atomic workspace and UID profile; retries cannot change membership or role',async()=> {
  const e=environment(),h=harness(e),route=h.load('src/app/api/auth/route.ts');
  const body={action:'signup',idToken:'valid',salonName:'New salon',ownerName:'New owner',role:'manager',salonId:999,email:'spoof@example.invalid'};
  const responses=await Promise.all([route.POST(await mutation(h,e,'/api/auth',body)),route.POST(await mutation(h,e,'/api/auth',body))]);
  assert.ok(responses.every(r=>r.status===201));
  const user=h.db.data.get('users/test-uid');assert.equal(user.role,'owner');assert.equal(user.salonId,'1');assert.equal(user.email,'operator@example.invalid');assert.ok(!('passwordHash' in user));
  assert.equal([...h.db.data.keys()].filter(p=>/^salons\/\d+$/.test(p)).length,1);
  assert.equal([...h.db.data.keys()].filter(p=>p.startsWith('users/')).length,1);
  assert.equal((await h.repo.serviceRepository.list(1)).length,6);assert.equal((await h.repo.staffRepository.list(1)).length,2);
  assert.equal((await route.POST(await mutation(h,e,'/api/auth',{...body,salonName:'Another salon'}))).status,201);
  assert.equal(h.db.data.get('salons/1').name,'New salon');
});
test('failed provisioning leaves no partial Firestore workspace; same Firebase UID can retry',async()=> {
  const e=environment(),h=harness(e),route=h.load('src/app/api/auth/route.ts');
  const body={action:'signup',idToken:'valid',salonName:'Retry salon',ownerName:'Retry owner'};
  const original=h.repo.offerRepository.create;h.repo.offerRepository.create=async()=>{throw Error('simulated provisioning failure');};
  assert.equal((await route.POST(await mutation(h,e,'/api/auth',body))).status,500);assert.equal(h.db.data.size,0);
  h.repo.offerRepository.create=original;
  assert.equal((await route.POST(await mutation(h,e,'/api/auth',body))).status,201);assert.ok(h.db.data.has('users/test-uid'));
});
