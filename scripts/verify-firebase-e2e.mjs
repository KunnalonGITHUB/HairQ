// Isolated local verification only: never accepts a real Firebase project.
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdirSync,readdirSync,existsSync,createWriteStream,writeFileSync} from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {runVerification} from './verification/firebase-scenarios.mjs';
const require=createRequire(import.meta.url),root=process.cwd();
const tools=path.join(root,'.verification-tools');mkdirSync(tools,{recursive:true});
const project='demo-hairq-verification',base='http://127.0.0.1:3100';
const children=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function listening(port){return new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});socket.on('connect',()=>{socket.destroy();resolve(true);});socket.on('error',()=>resolve(false));});}
async function waitFor(port,child){for(let i=0;i<180;i++){if(await listening(port))return;if(child.exitCode!=null)throw Error(`Verification process exited; see ${tools} logs.`);await sleep(1000);}throw Error(`Local verification port ${port} did not start.`);}
function launch(label,args,env){const log=createWriteStream(path.join(tools,label+'.log'));const child=spawn(process.execPath,args,{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log);child.stderr.pipe(log);children.push(child);return child;}
async function stop(child){if(child.exitCode!=null)return;if(process.platform==='win32'){await new Promise(resolve=>{const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('exit',resolve);killer.on('error',resolve);});}else child.kill('SIGTERM');}
try{
  for(const port of [3100,8080,9099,4400])if(await listening(port))throw Error(`Port ${port} already in use; verification will not alter an existing service.`);
  const javaFolder=readdirSync(path.join(tools,'runtime')).find(name=>existsSync(path.join(tools,'runtime',name,'bin','java.exe')));
  if(!javaFolder)throw Error('Portable Java runtime missing. See verification setup documentation.');
  const javaHome=path.join(tools,'runtime',javaFolder);
  const env={...process.env,NODE_ENV:'development',CI:'true',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true',FIREBASE_EMULATORS_PATH:path.join(tools,'emulators'),JAVA_HOME:javaHome,Path:path.join(javaHome,'bin')+path.delimiter+(process.env.Path??process.env.PATH??''),FIREBASE_PROJECT_ID:project,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',NEXT_PUBLIC_FIREBASE_PROJECT_ID:project,NEXT_PUBLIC_FIREBASE_API_KEY:'local-emulator-only',NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:project+'.firebaseapp.com',NEXT_PUBLIC_FIREBASE_APP_ID:'1:123:web:local',NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL:'http://127.0.0.1:9099'};
  // Prevent inheriting deployment credentials into the fixture environment.
  for(const key of ['DATABASE_URL','FIREBASE_TOKEN','FIREBASE_CLIENT_EMAIL','FIREBASE_PRIVATE_KEY','GOOGLE_APPLICATION_CREDENTIALS','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY'])delete env[key];
  // Windows environment keys are case-insensitive; avoid duplicate PATH keys.
  for(const key of Object.keys(env))if(key.toUpperCase()==='PATH')delete env[key];
  env.PATH=path.join(javaHome,'bin')+path.delimiter+(process.env.Path??process.env.PATH??'');
  env.HAIRQ_APP_ORIGIN=base;
  const emulator=launch('emulators',[path.join(tools,'node_modules/firebase-tools/lib/bin/firebase.js'),'emulators:start','--only','auth,firestore','--project',project,'--non-interactive'],env);
  await waitFor(8080,emulator);await waitFor(9099,emulator);
  const keys=require('web-push').generateVAPIDKeys();env.VAPID_PUBLIC_KEY=keys.publicKey;env.VAPID_PRIVATE_KEY=keys.privateKey;
  let app=launch('application',[require.resolve('next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3100'],env);
  await waitFor(3100,app);
  Object.assign(process.env,{FIREBASE_PROJECT_ID:project,FIRESTORE_EMULATOR_HOST:env.FIRESTORE_EMULATOR_HOST,FIREBASE_AUTH_EMULATOR_HOST:env.FIREBASE_AUTH_EMULATOR_HOST});
  const report=await runVerification({base,project,tools,restart:async()=>{await stop(app);app=launch('application-restarted',[require.resolve('next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3100'],env);await waitFor(3100,app);}});
  writeFileSync(path.join(tools,'report.json'),JSON.stringify(report,null,2));
  process.exitCode=report.failures.length?1:0;
}catch(error){console.error('[verification]',error instanceof Error?error.message:'Verification failed');process.exitCode=1;}
finally{for(const child of [...children].reverse())await stop(child);}
