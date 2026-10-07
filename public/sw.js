// HairQ white-label service worker.
// Intentionally minimal caching: salons need installability + reliable push,
// not aggressive caching that could show a stale queue position.

const SHELL = "hairq-shell-v2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Queue data must always be live.
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && req.mode === "navigate") {
          const copy = res.clone();
          caches.open(SHELL).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response(
          "<html><body style='font-family:system-ui;padding:40px;color:#191411;background:#F4F1EC'><h1 style='font-size:18px'>You're offline</h1><p style='color:#7b7067'>Reconnect to see the live queue.</p></body></html>",
          { headers: { "Content-Type": "text/html" }, status: 200 },
        );
      }),
  );
});

/* ------------------------------------------------------------------ push */

function parsePush(event) {
  const fallback = {
    title: "Update from your salon",
    body: "Open the app to see the latest.",
    url: "/",
    tag: "hairq",
  };
  if (!event.data) return fallback;
  try {
    const data = event.data.json();
    return {
      title: data.title || fallback.title,
      body: data.body || fallback.body,
      url: data.url || fallback.url,
      tag: data.tag || fallback.tag,
      type: data.type || "queue",
      icon: data.icon,
      badge: data.badge,
      renotify: data.renotify !== false,
      requireInteraction: Boolean(data.requireInteraction),
      timestamp: data.timestamp,
    };
  } catch {
    try {
      return { ...fallback, body: event.data.text() };
    } catch {
      return fallback;
    }
  }
}

self.addEventListener("push", (event) => {
  const data = parsePush(event);

  // Derive a salon-scoped icon from the target URL so the notification always
  // carries the salon's own identity, never HairQ's.
  let icon = data.icon;
  let badge = data.badge;
  try {
    const path = new URL(data.url, self.location.origin).pathname;
    const match = path.match(/^\/s\/([^/]+)/);
    if (match && !icon) icon = `/s/${match[1]}/icon.svg`;
    if (match && !badge) badge = `/s/${match[1]}/icon.svg`;
  } catch {
    /* keep whatever the payload provided */
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: icon || undefined,
      badge: badge || undefined,
      tag: data.tag,
      renotify: data.renotify,
      requireInteraction: data.requireInteraction,
      timestamp: data.timestamp || Date.now(),
      data: { url: data.url, type: data.type },
      vibrate: data.type === "marketing" ? [60] : [80, 40, 80],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  const absolute = new URL(target, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of list) {
        // Focus an existing tab of the same salon and navigate it.
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          await client.focus();
          if ("navigate" in client && client.url !== absolute) {
            try {
              await client.navigate(absolute);
            } catch {
              /* some browsers disallow navigate(); focus is enough */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(absolute);
    })(),
  );
});

/* ------------------------------------------- subscription self-healing */

function base64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = self.atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

// Push services rotate endpoints. When that happens the browser fires this
// event and we silently register the replacement against the same record.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const oldEndpoint = event.oldSubscription && event.oldSubscription.endpoint;
      try {
        const res = await fetch("/api/public/push-key", { cache: "no-store" });
        const { publicKey } = await res.json();
        if (!publicKey) return;

        const fresh = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToUint8Array(publicKey),
        });

        await fetch("/api/public/push-resubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldEndpoint, subscription: fresh.toJSON() }),
        });
      } catch (err) {
        // Nothing user-visible to do here; the page will re-subscribe on the
        // customer's next visit.
      }
    })(),
  );
});
