import type { PushSubscription } from "./entities";

/** Keep the response keys while retaining Web Push transport keys on the server. */
export function publicSubscription(row:PushSubscription|null|undefined) {
  return row ? {...row,p256dh:null,auth:null} : null;
}
