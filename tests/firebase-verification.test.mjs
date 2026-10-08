import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture} from './support/firestore-harness.mjs';

test('Firestore unavailable errors produce safe 503 responses on protected and public routes',async()=>{
  const h=await fixture();h.db.runTransaction=async()=>{throw Object.assign(new Error('Private infrastructure details'),{code:14});};
  const protectedResponse=await h.load('src/app/api/owner/services/route.ts').GET(new Request('https://hairq.example.invalid/api/owner/services'));
  assert.equal(protectedResponse.status,503);assert.ok(!JSON.stringify(await protectedResponse.json()).includes('Private infrastructure'));
  const publicResponse=await h.load('src/app/api/public/[slug]/route.ts').GET(new Request('https://hairq.example.invalid/api/public/test-salon'),{params:Promise.resolve({slug:'test-salon'})});
  assert.equal(publicResponse.status,503);
});
test('410 push failure is post-commit, invalidates subscription, and preserves notification/business writes',async()=>{
  const h=await fixture(20,{pushFailure:410});await h.repo.pushSubscriptionRepository.create(1,{customerId:1,endpoint:'https://push.example.invalid/gone',p256dh:'test-key',auth:'test-auth',permission:'granted'});
  const notify=h.load('src/lib/salon-data.ts').pushNotification;
  await h.store.runTransaction(()=>notify({salonId:1,customerId:1,type:'queue',title:'Test',body:'Persist despite failed transport'}),1);
  assert.equal((await h.repo.notificationRepository.list(1)).length,1);assert.equal(h.db.pushes.length,1);
  const sub=(await h.repo.pushSubscriptionRepository.list(1))[0];assert.ok(sub.invalidAt);assert.equal(sub.endpoint,null);assert.equal(sub.p256dh,null);assert.equal(sub.auth,null);
});
test('production never silently generates a replacement VAPID keypair',async()=>{
  const h=await fixture(20,{env:{NODE_ENV:'production',VAPID_PUBLIC_KEY:'',VAPID_PRIVATE_KEY:''}});
  assert.equal(h.load('src/lib/web-push.ts').pushPublicKey(),null);assert.equal(h.load('src/lib/web-push.ts').pushConfigured(),false);
});
