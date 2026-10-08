import "server-only";
import { pushSubscriptions } from "./fields";
import { eq } from "./query";
import { pushSubscriptionRepository } from "./repositories";
import { digest, readRegistry, runTransaction } from "./store";

/** Resolve the service worker's endpoint capability to a known tenant first. */
export async function rotatePushEndpoint(oldEndpoint:string,subscription:{endpoint:string;p256dh:string;auth:string}) {
  return runTransaction(async()=> {
    const owner=await readRegistry(`pushEndpoints/${digest(oldEndpoint)}`);
    if(!owner||typeof owner.salonId!=='number'||typeof owner.subscriptionId!=='number')return false;
    const rows=await pushSubscriptionRepository.find(owner.salonId,{where:eq(pushSubscriptions.id,owner.subscriptionId),limit:1});
    if(rows[0]?.endpoint!==oldEndpoint)return false;
    await pushSubscriptionRepository.update(owner.salonId,eq(pushSubscriptions.id,owner.subscriptionId),{...subscription,invalidAt:null,lastSeenAt:new Date()});
    return true;
  });
}
