import { publicSubscription } from "@/lib/firestore/public-dto";
import { requestJson } from "@/lib/api-helpers";
import { notificationRepository, pushSubscriptionRepository, customerRepository } from "@/lib/firestore/repositories";
import { and, desc, eq, isNull } from "@/lib/firestore/query";

import { customers, notifications, pushSubscriptions } from "@/lib/firestore/fields";
import { bool, fail, guarded, num, ok, str } from "@/lib/api-helpers";
import { getSalonBySlug } from "@/lib/salon-data";

export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return guarded(async () => {
    const { slug } = await ctx.params;
    const salon = await getSalonBySlug(slug);
    if (!salon) return fail("We couldn't find that salon link.", 404);

    const url = new URL(request.url);
    const customerId = Number(url.searchParams.get("customerId"));
    if (!customerId) return ok({ notifications: [], unread: 0, subscription: null });

    const [rows, sub] = await Promise.all([
      notificationRepository.find(salon.id, { where: and(eq(notifications.salonId, salon.id), eq(notifications.customerId, customerId)), orderBy: [desc(notifications.deliveredAt)], limit: 30 }),
      pushSubscriptionRepository.find(salon.id, { where: eq(pushSubscriptions.customerId, customerId), limit: 1 }),
    ]);

    const row = sub[0] ?? null;
    return ok({
      notifications: rows,
      unread: rows.filter((r) => !r.readAt).length,
      subscription: publicSubscription(row),
      // A row alone does not mean push works — only a complete endpoint +
      // keypair does. The client uses this to decide whether to re-subscribe.
      pushReady: Boolean(row?.endpoint && row?.p256dh && row?.auth && !row?.invalidAt),
      pushEndpoint: row?.endpoint ?? null,
    });
  });
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return guarded(async () => {
    const { slug } = await ctx.params;
    const salon = await getSalonBySlug(slug);
    if (!salon) return fail("We couldn't find that salon link.", 404);

    const body = (await requestJson(request).catch(() => ({}))) as Record<string, unknown>;
    const action = str(body.action);
    const customerId = num(body.customerId);
    if (!customerId) return fail("We need to know who you are first.");

    const exists = await customerRepository.find(salon.id, { select: { id: customers.id }, where: and(eq(customers.id, customerId), eq(customers.salonId, salon.id)), limit: 1 });
    if (!exists[0]) return fail("We couldn't match that profile.", 404);

    if (action === "mark_read") {
      await notificationRepository.update(salon.id, and(eq(notifications.customerId, customerId), isNull(notifications.readAt)), { readAt: new Date() });
      return ok({ ok: true });
    }

    if (action === "pwa_installed") {
      await customerRepository.update(salon.id, eq(customers.id, customerId), { pwaInstalled: true });
      await pushSubscriptionRepository.update(salon.id, eq(pushSubscriptions.customerId, customerId), { lastSeenAt: new Date() });
      return ok({ ok: true });
    }

    const existing = await pushSubscriptionRepository.find(salon.id, { where: eq(pushSubscriptions.customerId, customerId), limit: 1 });

    // The browser subscription is optional (a customer may only toggle
    // preferences), but when supplied it must be complete to be usable.
    const rawSub = (body.subscription ?? null) as
      | { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
      | null;
    const endpoint = str(rawSub?.endpoint) || str(body.endpoint) || null;
    const p256dh = str(rawSub?.keys?.p256dh) || null;
    const auth = str(rawSub?.keys?.auth) || null;
    const hasTransport = Boolean(endpoint && p256dh && auth);

    const values: Record<string, unknown> = {
      queueOptIn: bool(body.queueOptIn, true),
      bookingOptIn: bool(body.bookingOptIn, true),
      marketingOptIn: bool(body.marketingOptIn, false),
      permission: str(body.permission) || "granted",
      deviceLabel: str(body.deviceLabel) || "Browser",
      lastSeenAt: new Date(),
    };

    if (hasTransport) {
      // Re-subscribing replaces the old endpoint, so one row per customer
      // never accumulates duplicates.
      values.endpoint = endpoint;
      values.p256dh = p256dh;
      values.auth = auth;
      values.invalidAt = null;
    } else if (!existing[0]) {
      values.endpoint = endpoint;
    }

    if (existing[0]) {
      const [updated] = await pushSubscriptionRepository.update(salon.id, eq(pushSubscriptions.id, existing[0].id), values);
      return ok({ subscription: publicSubscription(updated), pushReady: hasTransport });
    }

    const [created] = await pushSubscriptionRepository.create(salon.id, { salonId: salon.id, customerId, ...values });
    await customerRepository.update(salon.id, eq(customers.id, customerId), { lastActivityAt: new Date() });
    return ok({ subscription: publicSubscription(created), pushReady: hasTransport }, 201);
  });
}
