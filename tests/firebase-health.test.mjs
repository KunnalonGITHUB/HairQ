import assert from "node:assert/strict";
import {test} from "node:test";
import {harness} from "./support/firestore-harness.mjs";

// In-memory Firestore and Auth doubles only. No credentials or network access.
const auth={listUsers:async()=>({users:[]})};
const setup=(env={},adminAuth=auth)=>{
  const h=harness({env,adminAuth});
  return {h,route:h.load('src/app/api/health/route.ts'),Cfg:h.load('src/lib/firebase/admin-env.ts').FirebaseConfigurationError};
};
const call=async route=>{const response=await route.GET();return {status:response.status,body:await response.json()};};

test('health reports Firestore and Auth as working in development',async()=> {
  const {route}=setup({NODE_ENV:'development'});
  const {status,body}=await call(route);
  assert.equal(status,200);assert.equal(body.ok,true);
  assert.equal(body.firestore.ok,true);assert.equal(body.auth.ok,true);
});
test('health names missing variables in development without exposing any value',async()=> {
  const {h,route,Cfg}=setup({NODE_ENV:'development',FIREBASE_PRIVATE_KEY:'secret-value-must-not-leak'});
  h.db.collection=()=>{throw new Cfg('Missing Firebase Admin environment variables: FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY. Configure them in .env.local or your deployment environment.');};
  const {status,body}=await call(route);
  assert.equal(status,500);assert.equal(body.ok,false);
  assert.match(body.firestore.reason,/FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY/);
  assert.match(body.firestore.fix,/\.env\.local/);
  assert.equal(body.auth.ok,false);
  assert.ok(!JSON.stringify(body).includes('secret-value-must-not-leak'));
});
test('health explains permission, missing database and Auth setup problems',async()=> {
  const denied=setup({NODE_ENV:'development'});
  denied.h.db.collection=()=>({limit:()=>({get:async()=>{throw Object.assign(new Error('7 PERMISSION_DENIED: Missing or insufficient permissions.'),{code:7});}})});
  assert.match((await call(denied.route)).body.firestore.fix,/Cloud Datastore User/);
  const missing=setup({NODE_ENV:'development'});
  missing.h.db.collection=()=>({limit:()=>({get:async()=>{throw Object.assign(new Error('5 NOT_FOUND'),{code:5});}})});
  assert.match((await call(missing.route)).body.firestore.fix,/Create the \(default\) Firestore database/);
  const noAuth=setup({NODE_ENV:'development'},{listUsers:async()=>{throw Object.assign(new Error('x'),{code:'auth/configuration-not-found'});}});
  const result=await call(noAuth.route);
  assert.equal(result.status,200);assert.equal(result.body.firestore.ok,true);
  assert.equal(result.body.auth.ok,false);assert.match(result.body.auth.fix,/Email\/Password/);
});
test('production health keeps the minimal public response',async()=> {
  const healthy=setup({NODE_ENV:'production'});
  assert.deepEqual(await call(healthy.route),{status:200,body:{ok:true}});
  const broken=setup({NODE_ENV:'production'});
  broken.h.db.collection=()=>{throw new broken.Cfg('Missing Firebase Admin environment variables: FIREBASE_PRIVATE_KEY.');};
  assert.deepEqual(await call(broken.route),{status:500,body:{ok:false}});
});
