import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customers, notifications, pushSubscriptions } from "@/db/schema";
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
      db
        .select()
        .from(notifications)
        .where(and(eq(notifications.salonId, salon.id), eq(notifications.customerId, customerId)))
        .orderBy(desc(notifications.deliveredAt))
        .limit(30),
      db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.customerId, customerId))
        .limit(1),
    ]);

    const row = sub[0] ?? null;
    return ok({
      notifications: rows,
      unread: rows.filter((r) => !r.readAt).length,
      subscription: row,
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

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = str(body.action);
    const customerId = num(body.customerId);
    if (!customerId) return fail("We need to know who you are first.");

    const exists = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.salonId, salon.id)))
      .limit(1);
    if (!exists[0]) return fail("We couldn't match that profile.", 404);

    if (action === "mark_read") {
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.customerId, customerId), isNull(notifications.readAt)));
      return ok({ ok: true });
    }

    if (action === "pwa_installed") {
      await db.update(customers).set({ pwaInstalled: true }).where(eq(customers.id, customerId));
      await db
        .update(pushSubscriptions)
        .set({ lastSeenAt: new Date() })
        .where(eq(pushSubscriptions.customerId, customerId));
      return ok({ ok: true });
    }

    const existing = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.customerId, customerId))
      .limit(1);

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
      const [updated] = await db
        .update(pushSubscriptions)
        .set(values)
        .where(eq(pushSubscriptions.id, existing[0].id))
        .returning();
      return ok({ subscription: updated, pushReady: hasTransport });
    }

    const [created] = await db
      .insert(pushSubscriptions)
      .values({ salonId: salon.id, customerId, ...values })
      .returning();
    await db.update(customers).set({ lastActivityAt: new Date() }).where(eq(customers.id, customerId));
    return ok({ subscription: created, pushReady: hasTransport }, 201);
  });
}
