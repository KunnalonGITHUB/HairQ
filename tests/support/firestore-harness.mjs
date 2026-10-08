import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Unit-test fixtures exist only in this in-memory store. No SDK credentials,
// real Firestore connections, files or production records are used.
export class TestTimestamp {
  constructor(ms) { this.ms=ms; }
  static fromDate(date) { return new TestTimestamp(date.getTime()); }
  static now() { return TestTimestamp.fromDate(new Date()); }
  toDate() { return new Date(this.ms); }
}
function clone(input) {
  if(input instanceof TestTimestamp)return new TestTimestamp(input.ms);
  if(input instanceof Date)return new Date(input);
  if(Array.isArray(input))return input.map(clone);
  if(input&&typeof input==='object')return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,clone(v)]));
  return input;
}
class MemoryFirestore {
  data=new Map(); versions=new Map(); retries=0; pushes=[];
  doc(p) { return {path:p,get:async()=>this.snapshot(p)}; }
  collection(p) {
    const build=(filter=null,ordering=null,count=null)=>({path:p,query:true,filter,ordering,count,
      doc:id=>this.doc(p+'/'+id),
      where:(field,op,value)=> {assert.equal(op,'==');return build({field,value},ordering,count);},
      orderBy:(field,direction)=>build(filter,{field,direction},count),limit:n=>build(filter,ordering,n),get:async()=>this.query({path:p,filter,ordering,count})});
    return build();
  }
  snapshot(p) {return {exists:this.data.has(p),id:p.split('/').at(-1),data:()=>clone(this.data.get(p))};}
  query(q) {
    let rows=[...this.data].filter(([p])=>p.startsWith(q.path+'/')&&p.split('/').length===q.path.split('/').length+1);
    if(q.filter)rows=rows.filter(([,data])=>data[q.filter.field]===q.filter.value);
    if(q.ordering)rows.sort(([,a],[,b])=>Math.sign(a[q.ordering.field]-b[q.ordering.field])*(q.ordering.direction==='desc'?-1:1));
    if(q.count!=null)rows=rows.slice(0,q.count);
    return {docs:rows.map(([p])=>this.snapshot(p))};
  }
  async runTransaction(fn) {
    for(let attempt=0;attempt<30;attempt++) {
      const reads=new Map(),writes=[];
      const tx={
        get:async ref=> {
          assert.equal(writes.length,0,'Firestore transaction reads must precede writes');
          if(ref.query){const snap=this.query(ref);for(const doc of snap.docs)reads.set(ref.path+'/'+doc.id,this.versions.get(ref.path+'/'+doc.id)??0);return snap;}
          reads.set(ref.path,this.versions.get(ref.path)??0);return this.snapshot(ref.path);
        },
        set:(ref,data)=>writes.push({path:ref.path,data:clone(data)}),delete:ref=>writes.push({path:ref.path,data:null}),
      };
      const result=await fn(tx);
      if([...reads].some(([p,version])=>(this.versions.get(p)??0)!==version)){this.retries++;continue;}
      for(const write of writes){if(write.data)this.data.set(write.path,write.data);else this.data.delete(write.path);this.versions.set(write.path,(this.versions.get(write.path)??0)+1);}
      return result;
    }
    throw new Error('Test transaction retry limit exceeded');
  }
}
export function harness(options = {}) {
  const db=new MemoryFirestore(),cache=new Map();
  const session={uid:'test-uid',ownerId:1,salonId:1,name:'Test operator',email:'operator@example.invalid',role:'owner',salonName:'Test salon',salonSlug:'test-salon'};
  function load(file) {
    const full=path.resolve(file);if(cache.has(full))return cache.get(full);
    const testModule={exports:{}};cache.set(full,testModule.exports);
    const source=readFileSync(full,'utf8');
    const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
    runInNewContext(outputText,{
      module:testModule,exports:testModule.exports,Date,Buffer,Response,Request,URL,Headers,Map,Set,Promise,structuredClone,console:{error(){},warn(){}},
      process:{env:{VAPID_PUBLIC_KEY:'unit-test-public',VAPID_PRIVATE_KEY:'unit-test-private',...options.env},cwd:()=>process.cwd()},
      require(name) {
        if(name==='server-only')return {};
        if(name==='node:crypto')return crypto;
        if(name==='node:async_hooks')return {AsyncLocalStorage};
        if(name==='node:fs')return {existsSync:()=>false,writeFileSync:()=>{throw Error('Tests cannot write push key files');}};
        if(name==='node:path')return path;
        if(name==='firebase-admin/firestore')return {Timestamp:TestTimestamp};
        if(['../firebase/admin','./firebase/admin','@/lib/firebase/admin','./admin','../admin'].includes(name))return {getFirebaseFirestore:()=>db,getFirebaseAdminAuth:()=>options.adminAuth};
        if(name==='next/headers')return {cookies:async()=>options.cookies};
        if(!options.realAuth && name==='./auth-csrf')return {assertAuthMutation:async()=>{}};
        if(!options.realAuth && (name==='./auth'||name==='@/lib/auth'))return {getSessionUser:async()=>session,newToken:()=>crypto.randomBytes(16).toString('base64url')};
        if(name==='next/server')return {NextResponse:{json:Response.json}};
        if(name==='web-push')return {setVapidDetails(){},sendNotification:async(subscription)=>{db.pushes.push(subscription);if(options.pushFailure)throw Object.assign(new Error('Simulated push failure'),{statusCode:options.pushFailure});}};
        const candidate=name.startsWith('@/')?path.resolve('src',name.slice(2)):path.resolve(path.dirname(full),name);
        const resolved=existsSync(candidate+'.ts')?candidate+'.ts':candidate;
        return load(resolved);
      },
    },{filename:full});
    cache.set(full,testModule.exports);return testModule.exports;
  }
  return {db,session,load,repo:load('src/lib/firestore/repositories.ts'),store:load('src/lib/firestore/store.ts'),fields:load('src/lib/firestore/fields.ts'),query:load('src/lib/firestore/query.ts')};
}
export async function fixture(maxQueueSize=20, options = {}) {
  const h=harness(options);
  const salon=h.store.defaults('salons',{name:'Test salon',slug:'test-salon',maxQueueSize},1,1);
  await h.store.provisionSalon(salon,async()=> {
    await h.repo.serviceRepository.create(1,{name:'Test service',price:250,durationMin:30});
    await h.repo.staffRepository.create(1,{name:'Test staff'});
    await h.repo.staffServiceRepository.create(1,{staffId:1,serviceId:1});
    await h.repo.workingHoursRepository.create(1,Array.from({length:7},(_,dayOfWeek)=>({dayOfWeek,openTime:'00:00',closeTime:'23:59'})));
    await h.repo.customerRepository.create(1,[{name:'Test customer A',phone:'1234567890'},{name:'Test customer B',phone:'1234567891'}]);
  });
  return h;
}
