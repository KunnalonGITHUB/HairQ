"use client";

/**
 * Browser-side Web Push lifecycle.
 *
 * Key rule: `Notification.permission === "granted"` is NEVER treated as proof
 * that push works. We always verify a real PushSubscription exists, that it
 * was created with the current VAPID key, and that the server has its keys.
 */

export type PushPrefs = {
  queueOptIn: boolean;
  bookingOptIn: boolean;
  marketingOptIn: boolean;
};

export type PushResult =
  | { ok: true; status: "subscribed" | "already" | "prefs-only" }
  | { ok: false; status: "unsupported" | "denied" | "dismissed" | "insecure" | "failed"; message: string };

const FRIENDLY: Record<string, string> = {
  unsupported: "This browser can't deliver salon alerts. You can still track your turn on this page.",
  denied:
    "Notifications are blocked for this site. Allow them in your browser settings to get turn alerts.",
  dismissed: "No problem — you can turn on alerts any time from “Your visits”.",
  insecure: "Alerts need a secure (https) connection. You can still track your turn on this page.",
  failed: "We couldn't switch on alerts just now. You can still track your turn on this page.",
};

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isSecureContextOk(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext || window.location.hostname === "localhost";
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function bufferToBase64Url(buffer: ArrayBuffer | null): string | null {
  if (!buffer) return null;
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Registers (or reuses) the service worker and waits until it is active. */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported() || !isSecureContextOk()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration("/");
    const registration = existing ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
    // `ready` resolves once a worker is active and controlling the scope.
    await navigator.serviceWorker.ready;
    return registration;
  } catch {
    return null;
  }
}

let cachedKey: string | null | undefined;

async function getVapidKey(): Promise<string | null> {
  if (cachedKey !== undefined) return cachedKey;
  try {
    const res = await fetch("/api/public/push-key", { cache: "no-store" });
    const json = (await res.json()) as { enabled?: boolean; publicKey?: string | null };
    cachedKey = json.enabled && json.publicKey ? json.publicKey : null;
  } catch {
    cachedKey = null;
  }
  return cachedKey;
}

async function persist(
  slug: string,
  customerId: number,
  prefs: PushPrefs,
  subscription: PushSubscription | null,
) {
  const payload: Record<string, unknown> = {
    customerId,
    ...prefs,
    permission: typeof Notification !== "undefined" ? Notification.permission : "default",
    deviceLabel:
      typeof navigator !== "undefined" && /iPhone|iPad|Android/i.test(navigator.userAgent)
        ? "Mobile browser"
        : "Desktop browser",
  };
  if (subscription) payload.subscription = subscription.toJSON();

  const res = await fetch(`/api/public/${slug}/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("persist-failed");
}

/**
 * Guarantees a usable push subscription exists for this customer.
 *
 * @param interactive when true we may show the browser permission prompt.
 *                    When false (silent self-heal) we only act if permission
 *                    was already granted.
 */
export async function ensurePushSubscription(
  slug: string,
  customerId: number,
  prefs: PushPrefs,
  options: { interactive?: boolean } = {},
): Promise<PushResult> {
  const interactive = options.interactive ?? true;
  const wantsPush = prefs.queueOptIn || prefs.bookingOptIn || prefs.marketingOptIn;

  if (!pushSupported()) {
    // Preferences still matter for the in-app feed.
    if (wantsPush) await persist(slug, customerId, prefs, null).catch(() => undefined);
    return { ok: false, status: "unsupported", message: FRIENDLY.unsupported };
  }
  if (!isSecureContextOk()) {
    if (wantsPush) await persist(slug, customerId, prefs, null).catch(() => undefined);
    return { ok: false, status: "insecure", message: FRIENDLY.insecure };
  }

  // Opting out of everything: just save preferences.
  if (!wantsPush) {
    await persist(slug, customerId, prefs, null).catch(() => undefined);
    return { ok: true, status: "prefs-only" };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    if (!interactive) return { ok: false, status: "dismissed", message: FRIENDLY.dismissed };
    try {
      permission = await Notification.requestPermission();
    } catch {
      return { ok: false, status: "failed", message: FRIENDLY.failed };
    }
  }

  if (permission === "denied") {
    await persist(slug, customerId, prefs, null).catch(() => undefined);
    return { ok: false, status: "denied", message: FRIENDLY.denied };
  }
  if (permission !== "granted") {
    return { ok: false, status: "dismissed", message: FRIENDLY.dismissed };
  }

  try {
    const registration = await ensureServiceWorker();
    if (!registration) {
      await persist(slug, customerId, prefs, null).catch(() => undefined);
      return { ok: false, status: "failed", message: FRIENDLY.failed };
    }

    const key = await getVapidKey();
    if (!key) {
      // Server has no VAPID keypair — store prefs so the in-app feed works.
      await persist(slug, customerId, prefs, null).catch(() => undefined);
      return { ok: false, status: "failed", message: FRIENDLY.failed };
    }

    let subscription = await registration.pushManager.getSubscription();
    let reused = Boolean(subscription);

    // A subscription made with a different (rotated) VAPID key is unusable.
    if (subscription) {
      const current = bufferToBase64Url(subscription.options?.applicationServerKey ?? null);
      if (current && current !== key) {
        await subscription.unsubscribe().catch(() => undefined);
        subscription = null;
        reused = false;
      }
    }

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
    }

    await persist(slug, customerId, prefs, subscription);
    return { ok: true, status: reused ? "already" : "subscribed" };
  } catch {
    await persist(slug, customerId, prefs, null).catch(() => undefined);
    return { ok: false, status: "failed", message: FRIENDLY.failed };
  }
}

/**
 * Silent repair for customers who granted permission before push transport
 * existed (or whose subscription was dropped by the browser).
 */
export async function healPushSubscription(slug: string, customerId: number): Promise<void> {
  if (!pushSupported() || !isSecureContextOk()) return;
  if (Notification.permission !== "granted") return;

  try {
    const res = await fetch(`/api/public/${slug}/notify?customerId=${customerId}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as {
      pushReady?: boolean;
      pushEndpoint?: string | null;
      subscription?: PushPrefs | null;
    };

    const registration = await ensureServiceWorker();
    if (!registration) return;
    const browserSub = await registration.pushManager.getSubscription();

    // Healthy when the server has keys AND the browser still holds the very
    // same endpoint. Anything else means we must (re)subscribe.
    if (json.pushReady && browserSub && browserSub.endpoint === json.pushEndpoint) return;

    const prefs: PushPrefs = {
      queueOptIn: json.subscription?.queueOptIn ?? true,
      bookingOptIn: json.subscription?.bookingOptIn ?? true,
      marketingOptIn: json.subscription?.marketingOptIn ?? false,
    };

    await ensurePushSubscription(slug, customerId, prefs, { interactive: false });
  } catch {
    /* self-healing must never surface an error to the customer */
  }
}
