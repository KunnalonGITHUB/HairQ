import fs from "node:fs";
import path from "node:path";
import webpush, { type PushSubscription as WebPushSubscription } from "web-push";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";

/**
 * Real Web Push delivery.
 *
 * The notifications table remains the in-app feed (unchanged). This module is
 * the transport that actually wakes a device up when the PWA is closed.
 */

export type PushPayload = {
  title: string;
  body: string;
  url?: string | null;
  tag?: string;
  type?: "queue" | "booking" | "marketing";
  icon?: string | null;
  badge?: string | null;
  renotify?: boolean;
  requireInteraction?: boolean;
};

let configured: boolean | null = null;
let keys: { publicKey: string; privateKey: string } | null = null;

const KEYFILE = path.join(process.cwd(), ".vapid.json");

/**
 * Resolves the VAPID keypair.
 *
 * Priority: environment variables (operator-managed secrets) → a locally
 * persisted keyfile → a freshly generated pair written to that keyfile.
 * The fallback means push keeps working even if the environment is
 * re-provisioned without the keys.
 */
function resolveKeys(): { publicKey: string; privateKey: string } | null {
  if (keys) return keys;

  const envPublic = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPublic && envPrivate) {
    keys = { publicKey: envPublic, privateKey: envPrivate };
    return keys;
  }

  try {
    if (fs.existsSync(KEYFILE)) {
      const parsed = JSON.parse(fs.readFileSync(KEYFILE, "utf8")) as {
        publicKey?: string;
        privateKey?: string;
      };
      if (parsed.publicKey && parsed.privateKey) {
        keys = { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
        return keys;
      }
    }
  } catch {
    /* fall through and regenerate */
  }

  try {
    const generated = webpush.generateVAPIDKeys();
    fs.writeFileSync(KEYFILE, JSON.stringify(generated), { mode: 0o600 });
    console.warn(
      "[hairq:push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — generated a local keypair at .vapid.json",
    );
    keys = generated;
    return keys;
  } catch (err) {
    console.error("[hairq:push] unable to provision VAPID keys", err);
    return null;
  }
}

export function pushPublicKey(): string | null {
  return resolveKeys()?.publicKey ?? null;
}

/** True only when a usable VAPID keypair is present. */
export function pushConfigured(): boolean {
  if (configured !== null) return configured;
  const pair = resolveKeys();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:push@hairq.app";
  if (!pair) {
    configured = false;
    return configured;
  }
  try {
    webpush.setVapidDetails(subject, pair.publicKey, pair.privateKey);
    configured = true;
  } catch (err) {
    console.error("[hairq:push] invalid VAPID configuration", err);
    configured = false;
  }
  return configured;
}

type SubRow = {
  id: number;
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
};

function toWebPushSubscription(row: SubRow): WebPushSubscription | null {
  if (!row.endpoint || !row.p256dh || !row.auth) return null;
  return {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  };
}

async function markInvalid(id: number) {
  await db
    .update(pushSubscriptions)
    .set({ invalidAt: new Date(), endpoint: null, p256dh: null, auth: null })
    .where(eq(pushSubscriptions.id, id));
}

/**
 * Sends one payload to every stored subscription for the given customers.
 * Dead endpoints (404/410) are cleared so the client re-subscribes next visit.
 */
export async function sendPushToCustomers(
  customerIds: number[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const result = { sent: 0, failed: 0, skipped: 0 };
  if (customerIds.length === 0) return result;
  if (!pushConfigured()) {
    // Not an error for the operator: the in-app feed still works.
    return { ...result, skipped: customerIds.length };
  }

  const rows = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.customerId, customerIds));

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
    tag: payload.tag,
    type: payload.type ?? "queue",
    icon: payload.icon ?? undefined,
    badge: payload.badge ?? undefined,
    renotify: payload.renotify ?? true,
    requireInteraction: payload.requireInteraction ?? false,
    timestamp: Date.now(),
  });

  const jobs = rows.map(async (row) => {
    const sub = toWebPushSubscription(row);
    if (!sub) {
      result.skipped += 1;
      return;
    }
    try {
      await webpush.sendNotification(sub, body, {
        TTL: payload.type === "marketing" ? 60 * 60 * 24 : 60 * 30,
        urgency: payload.type === "marketing" ? "normal" : "high",
      });
      result.sent += 1;
      await db
        .update(pushSubscriptions)
        .set({ lastPushAt: new Date(), invalidAt: null })
        .where(eq(pushSubscriptions.id, row.id));
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await markInvalid(row.id);
      } else {
        console.error("[hairq:push] delivery failed", status, (err as Error).message);
      }
      result.failed += 1;
    }
  });

  await Promise.allSettled(jobs);
  return result;
}
