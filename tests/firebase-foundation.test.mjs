import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";

// Load the TypeScript modules in memory with isolated SDK/environment doubles.
// No Firebase credentials, network requests, or database writes are involved.
function loadModule(file, mocks = {}, env = {}, globals = {}, client = false) {
  const source = readFileSync(new URL(`../src/lib/firebase/${file}`, import.meta.url), "utf8");
  assert.match(source, client ? /^"use client"/ : /import "server-only"/, `${file} must declare its boundary`);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const testModule = { exports: {} };
  runInNewContext(outputText, {
    module: testModule, exports: testModule.exports, Buffer, process: { env },
    require(name) {
      if (name === "server-only") return {};
      if (name === "node:crypto") return crypto;
      if (name in mocks) return mocks[name];
      throw new Error(`Unexpected module dependency: ${name}`);
    },
    ...globals,
  });
  return testModule.exports;
}

test("Admin environment validation is lazy and reports variable names only", () => {
  const { getFirebaseAdminEnvironment } = loadModule("admin-env.ts");
  assert.throws(getFirebaseAdminEnvironment, /FIREBASE_PROJECT_ID.*FIREBASE_CLIENT_EMAIL.*FIREBASE_PRIVATE_KEY/);
});

test("Admin validation redacts malformed private keys and detects project mismatch", () => {
  const env = {
    FIREBASE_PROJECT_ID: "hairq-test",
    FIREBASE_CLIENT_EMAIL: "admin@hairq-test.iam.gserviceaccount.com",
    FIREBASE_PRIVATE_KEY: "sensitive-invalid-key",
  };
  const { getFirebaseAdminEnvironment } = loadModule("admin-env.ts", {}, env);
  assert.throws(getFirebaseAdminEnvironment, (error) => {
    assert.match(error.message, /valid RSA PEM/);
    assert.ok(!error.message.includes(env.FIREBASE_PRIVATE_KEY));
    return true;
  });
  env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "another-project";
  assert.throws(getFirebaseAdminEnvironment, /project IDs must match/);
});

test("Admin validation accepts escaped PEM newlines", () => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const { getFirebaseAdminEnvironment } = loadModule("admin-env.ts", {}, {
    FIREBASE_PROJECT_ID: "hairq-test",
    FIREBASE_CLIENT_EMAIL: "admin@hairq-test.iam.gserviceaccount.com",
    FIREBASE_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n"),
  });
  assert.equal(getFirebaseAdminEnvironment().privateKey, privateKey.trim());
});

test("Admin SDK app registry reuses initialization across module reloads", () => {
  const apps = [];
  let initializations = 0;
  const auth = {};
  const firestore = {};
  const mocks = {
    "firebase-admin/app": {
      getApps: () => apps,
      cert: (value) => value,
      initializeApp(options, name) {
        initializations += 1;
        const app = { name, options };
        apps.push(app);
        return app;
      },
    },
    "firebase-admin/auth": { getAuth: () => auth },
    "firebase-admin/firestore": { getFirestore: () => firestore },
    "./admin-env": {
      FirebaseConfigurationError: Error,
      getFirebaseAdminEnvironment: () => ({ projectId: "hairq-test" }),
    },
  };
  const first = loadModule("admin.ts", mocks);
  const app = first.getFirebaseAdminApp();
  assert.equal(first.getFirebaseAdminAuth(), auth);
  assert.equal(first.getFirebaseFirestore(), firestore);
  assert.equal(loadModule("admin.ts", mocks).getFirebaseAdminApp(), app);
  assert.equal(initializations, 1);
});

test("Client initialization uses only public config, is lazy, and reuses its app", () => {
  const apps = [];
  const mocks = {
    "firebase/app": {
      getApps: () => apps,
      initializeApp(options, name) { const app = { options, name }; apps.push(app); return app; },
    },
    "firebase/auth": { getAuth: (app) => ({ app }) },
  };
  const client = loadModule("client.ts", mocks, {}, { window: {} }, true);
  assert.throws(client.getFirebaseClientApp, /NEXT_PUBLIC_FIREBASE_API_KEY/);
  const env = {
    NEXT_PUBLIC_FIREBASE_API_KEY: "public-test-key",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "hairq-test.firebaseapp.com",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "hairq-test",
    NEXT_PUBLIC_FIREBASE_APP_ID: "public-test-app",
    FIREBASE_PRIVATE_KEY: "must-not-reach-client-config",
  };
  const configured = loadModule("client.ts", mocks, env, { window: {} }, true);
  const app = configured.getFirebaseClientApp();
  assert.equal(configured.getFirebaseClientAuth().app, app);
  assert.equal(loadModule("client.ts", mocks, env, { window: {} }, true).getFirebaseClientApp(), app);
  assert.ok(!JSON.stringify(app).includes(env.FIREBASE_PRIVATE_KEY));
  assert.throws(loadModule("client.ts", mocks, env, {}, true).getFirebaseClientApp, /browser/);
});

test("Local emulator initialization needs no credentials and fails closed in production", () => {
  const calls = [];
  const mocks = {
    "firebase-admin/app": {
      getApps: () => [],
      initializeApp(options, name) { calls.push(options); return { options, name }; },
    },
    "firebase-admin/auth": {},
    "firebase-admin/firestore": {},
    "./admin-env": { FirebaseConfigurationError: Error, getFirebaseAdminEnvironment() { throw Error("Emulator must not load secrets"); } },
  };
  const env = { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_PROJECT_ID: "demo-hairq" };
  const app = loadModule("admin.ts", mocks, env).getFirebaseAdminApp();
  assert.equal(app.options.projectId, "demo-hairq");
  assert.ok(!("credential" in app.options));
  assert.throws(() => loadModule("admin.ts", mocks, { ...env, NODE_ENV: "production" }).getFirebaseAdminApp(), /local development/);
  assert.throws(() => loadModule("admin.ts", mocks, { ...env, FIREBASE_PROJECT_ID: "live-project" }).getFirebaseAdminApp(), /demo-/);
  assert.throws(() => loadModule("admin.ts", mocks, { ...env, FIRESTORE_EMULATOR_HOST: "remote.example:8080" }).getFirebaseAdminApp(), /local development/);
  assert.equal(calls.length, 1);
});

test('client Auth emulator connects once and cannot be enabled in production or on a remote host',()=>{
  const apps=[],auth={emulatorConfig:null};let connections=0;
  const mocks={'firebase/app':{getApps:()=>apps,initializeApp(options,name){const app={options,name};apps.push(app);return app;}},'firebase/auth':{getAuth:()=>auth,connectAuthEmulator(instance,url){connections++;instance.emulatorConfig={url};}}};
  const env={NEXT_PUBLIC_FIREBASE_API_KEY:'local-test',NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:'demo-hairq.firebaseapp.com',NEXT_PUBLIC_FIREBASE_PROJECT_ID:'demo-hairq',NEXT_PUBLIC_FIREBASE_APP_ID:'local-test-app',NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL:'http://127.0.0.1:9099',NODE_ENV:'development'};
  const client=loadModule('client.ts',mocks,env,{window:{}},true);client.getFirebaseClientAuth();client.getFirebaseClientAuth();assert.equal(connections,1);
  assert.throws(()=>loadModule('client.ts',mocks,{...env,NODE_ENV:'production'},{window:{}},true).getFirebaseClientAuth(),/localhost development/);
  assert.throws(()=>loadModule('client.ts',mocks,{...env,NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL:'http://remote.example:9099'},{window:{}},true).getFirebaseClientAuth(),/localhost development/);
});

test("Document IDs cannot escape the intended collection path", () => {
  const { assertDocumentId } = loadModule("repositories/paths.ts");
  for (const invalid of ["", " ", ".", "..", "salon/other", "__reserved__", "x".repeat(1501)]) {
    assert.throws(() => assertDocumentId(invalid));
  }
  assertDocumentId("123");
  assertDocumentId("legacy-owner-123");
});

test("Auth emulator cannot bypass production or cached Admin initialization guards", () => {
  const mocks={
    "firebase-admin/app":{getApps:()=>[{name:'hairq-admin'}],initializeApp(){throw Error('Unexpected initialization');}},
    "firebase-admin/auth":{},"firebase-admin/firestore":{},
    "./admin-env":{FirebaseConfigurationError:Error},
  };
  const env={FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_PROJECT_ID:'demo-hairq'};
  assert.throws(()=>loadModule('admin.ts',mocks,{...env,NODE_ENV:'production'}).getFirebaseAdminApp(),/local development/);
  assert.throws(()=>loadModule('admin.ts',mocks,{...env,FIREBASE_PROJECT_ID:'live-project'}).getFirebaseAdminApp(),/demo project/);
  assert.throws(()=>loadModule('admin.ts',mocks,{...env,FIREBASE_AUTH_EMULATOR_HOST:'remote.example:9099'}).getFirebaseAdminApp(),/local development/);
  assert.equal(loadModule('admin.ts',mocks,env).getFirebaseAdminApp().name,'hairq-admin');
});

function authFixture(profile, tokenFailure = false) {
  const calls = [];
  const auth = {
    async verifyIdToken(token, checkRevoked) {
      calls.push({ token, checkRevoked });
      if (tokenFailure) throw new Error("private-sdk-error");
      return { uid: "owner-1" };
    },
    async getUser() { return { uid: "owner-1", disabled: false }; },
  };
  const api = loadModule("auth.ts", {
    "./admin": { getFirebaseAdminAuth: () => auth },
    "./repositories/users": { findFirebaseUser: async () => profile },
    "./repositories/paths": loadModule("repositories/paths.ts"),
  });
  return { api, calls };
}

test("ID token verification checks revocation and sanitizes SDK failures", async () => {
  const { api, calls } = authFixture(null, true);
  await assert.rejects(api.verifyFirebaseIdToken("token"), (error) => {
    assert.equal(error.status, 401);
    assert.ok(!error.message.includes("private-sdk-error"));
    return true;
  });
  assert.equal(calls[0].checkRevoked, true);
  await assert.rejects(api.verifyFirebaseIdToken(""), { status: 401 });
});

test("Salon authorization denies other tenants, wrong roles, and unprovisioned users", async () => {
  const profile = { uid: "owner-1", active: true, role: "owner", salonId: "salon-a" };
  const { api } = authFixture(profile);
  const access = await api.requireFirebaseSalonUser("token", "salon-a", ["owner"]);
  assert.equal(access.salonId, "salon-a");
  await assert.rejects(api.requireFirebaseSalonUser("token", "salon-b", ["owner"]), { status: 403 });
  await assert.rejects(api.requireFirebaseSalonUser("token", "salon-a", ["manager"]), { status: 403 });
  profile.active = false;
  await assert.rejects(api.getAuthenticatedFirebaseUser("token"), { status: 403 });
  await assert.rejects(authFixture(null).api.getAuthenticatedFirebaseUser("token"), { status: 403 });
});

test("Malformed stored authorization documents fail closed", async () => {
  class Timestamp {}
  const data = {
    uid: "owner-1", email: "owner@example.com", name: "Owner", role: "owner",
    salonId: "salon-a", staffId: null, active: true,
    createdAt: new Timestamp(), updatedAt: new Timestamp(),
  };
  const { findFirebaseUser } = loadModule("repositories/users.ts", {
    "firebase-admin/firestore": { Timestamp },
    "../admin": { getFirebaseFirestore: () => ({
      collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => data }) }) }),
    }) },
    "./paths": loadModule("repositories/paths.ts"),
  });
  assert.equal((await findFirebaseUser("owner-1")).role, "owner");
  data.role = "administrator";
  await assert.rejects(findFirebaseUser("owner-1"), /authorization document is invalid/);
  data.role = "owner";
  data.salonId = null;
  await assert.rejects(findFirebaseUser("owner-1"), /authorization document is invalid/);
});
