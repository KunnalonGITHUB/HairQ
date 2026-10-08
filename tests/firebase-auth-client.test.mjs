import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function browser({existing=false,deny=false}={}) {
  const calls=[], requests=[], auth={};
  const sdk={
    inMemoryPersistence:{type:'NONE'},
    setPersistence:async(a,p)=>{assert.equal(a,auth);assert.equal(p.type,'NONE');calls.push('memory');},
    createUserWithEmailAndPassword:async()=>{calls.push('create');if(existing)throw {code:'auth/email-already-in-use'};return {user:{getIdToken:async()=> 'verified-by-server-token'}};},
    signInWithEmailAndPassword:async()=>{calls.push('signin');return {user:{getIdToken:async()=> 'verified-by-server-token'}};},
    signOut:async()=>{calls.push('signout');},
  };
  const testModule={exports:{}};
  const {outputText}=ts.transpileModule(readFileSync('src/lib/auth-client.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  runInNewContext(outputText,{module:testModule,exports:testModule.exports,console,Error,
    require:name=>name==='firebase/auth'?sdk:{getFirebaseClientAuth:()=>auth},
    fetch:async(url,options)=>{requests.push({url,options});if(!options?.method)return Response.json({csrfToken:'csrf-proof'});return Response.json(deny?{error:'Authorization denied'}:{ok:true,slug:'test-salon'},{status:deny?403:200});},
  });
  return {...testModule.exports,calls,requests};
}
const form={salonName:'Test salon',ownerName:'Test owner',phone:'',city:''};
test('browser login keeps Auth in memory, sends only token to server, and signs out SDK after exchange',async()=> {
  const client=browser();await client.authenticateHairQ('login','test@example.invalid','test-password',form);
  assert.deepEqual(client.calls,['memory','signin','signout']);
  const request=client.requests.find(r=>r.options?.method==='POST');
  assert.deepEqual(JSON.parse(request.options.body),{action:'login',idToken:'verified-by-server-token'});
  assert.equal(request.options.credentials,'same-origin');assert.equal(request.options.headers['X-HairQ-CSRF'],'csrf-proof');
  assert.ok(!request.options.body.includes('test-password'));
});
test('browser signup retries an existing Firebase identity after provisioning failure',async()=> {
  const client=browser({existing:true});await client.authenticateHairQ('signup','test@example.invalid','test-password',form);
  assert.deepEqual(client.calls,['memory','create','signin','signout']);
  const payload=JSON.parse(client.requests.find(r=>r.options?.method==='POST').options.body);
  assert.equal(payload.ownerName,form.ownerName);assert.ok(!('password' in payload));assert.ok(!('uid' in payload));assert.ok(!('role' in payload));
});
test('failed server authentication still clears browser Auth, and logout clears browser state',async()=> {
  const denied=browser({deny:true});await assert.rejects(denied.authenticateHairQ('login','test@example.invalid','test-password',form),/Authorization denied/);
  assert.equal(denied.calls.at(-1),'signout');
  const client=browser();await client.logoutHairQ();assert.deepEqual(client.calls,['signout']);
  assert.equal(JSON.parse(client.requests.find(r=>r.options?.method==='POST').options.body).action,'logout');
});
