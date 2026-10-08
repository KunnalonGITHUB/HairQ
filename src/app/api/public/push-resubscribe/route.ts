import { rotatePushEndpoint } from "@/lib/firestore/push-endpoints";
import { requestJson } from "@/lib/api-helpers";
import { fail, guarded, ok, str } from "@/lib/api-helpers";

/**
 * Called by the service worker's `pushsubscriptionchange` handler when a push
 * service rotates an endpoint. Matching on the OLD endpoint lets us heal the
 * record without the worker knowing which customer it belongs to.
 */
export async function POST(request: Request) {
  return guarded(async () => {
    const body = (await requestJson(request).catch(() => ({}))) as Record<string, unknown>;
    const oldEndpoint = str(body.oldEndpoint);
    const sub = (body.subscription ?? null) as
      | { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
      | null;

    const endpoint = str(sub?.endpoint);
    const p256dh = str(sub?.keys?.p256dh);
    const auth = str(sub?.keys?.auth);

    if (!endpoint || !p256dh || !auth) return fail("Incomplete subscription.", 400);
    if (!oldEndpoint) return fail("Missing previous subscription.", 400);

    const matched = await rotatePushEndpoint(oldEndpoint, { endpoint, p256dh, auth });
    return ok({ ok: true, matched });
  });
}
