import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, customers, notifications, pushSubscriptions, visits } from "@/db/schema";
import { fail, num, ok, str, withOwner } from "@/lib/api-helpers";
import { getSalonById } from "@/lib/salon-data";
import { sendPushToCustomers } from "@/lib/web-push";

type Recipient = { id: number; name: string };

async function resolveAudience(
  salonId: number,
  segment: string,
  selectedIds: number[],
  serviceId: number | null,
): Promise<Recipient[]> {
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      totalVisits: customers.totalVisits,
      lastVisitAt: customers.lastVisitAt,
      marketingOptIn: pushSubscriptions.marketingOptIn,
    })
    .from(customers)
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.customerId, customers.id))
    .where(and(eq(customers.salonId, salonId), eq(pushSubscriptions.marketingOptIn, true)));

  const now = Date.now();
  const DAY = 86400000;

  if (segment === "selected") {
    return rows.filter((r) => selectedIds.includes(r.id));
  }
  if (segment === "frequent") {
    return rows.filter((r) => r.totalVisits >= 4);
  }
  if (segment === "lapsed") {
    return rows.filter(
      (r) => !r.lastVisitAt || (now - new Date(r.lastVisitAt).getTime()) / DAY > 45,
    );
  }
  if (segment === "service" && serviceId) {
    const used = await db
      .select({ customerId: visits.customerId })
      .from(visits)
      .where(and(eq(visits.salonId, salonId), eq(visits.serviceId, serviceId)));
    const ids = new Set(used.map((u) => u.customerId));
    return rows.filter((r) => ids.has(r.id));
  }
  return rows;
}

export async function GET() {
  return withOwner(async (user) => {
    const [rows, optedIn, delivered] = await Promise.all([
      db
        .select()
        .from(campaigns)
        .where(eq(campaigns.salonId, user.salonId))
        .orderBy(desc(campaigns.createdAt))
        .limit(50),
      db
        .select({
          id: customers.id,
          name: customers.name,
          phone: customers.phone,
          totalVisits: customers.totalVisits,
          lastVisitAt: customers.lastVisitAt,
          marketingOptIn: pushSubscriptions.marketingOptIn,
        })
        .from(customers)
        .innerJoin(pushSubscriptions, eq(pushSubscriptions.customerId, customers.id))
        .where(and(eq(customers.salonId, user.salonId), eq(pushSubscriptions.marketingOptIn, true))),
      db
        .select({ id: notifications.id, type: notifications.type, readAt: notifications.readAt })
        .from(notifications)
        .where(eq(notifications.salonId, user.salonId)),
    ]);

    const now = Date.now();
    const DAY = 86400000;
    return ok({
      campaigns: rows,
      audience: {
        all_opted_in: optedIn.length,
        frequent: optedIn.filter((c) => c.totalVisits >= 4).length,
        lapsed: optedIn.filter(
          (c) => !c.lastVisitAt || (now - new Date(c.lastVisitAt).getTime()) / DAY > 45,
        ).length,
      },
      optedIn,
      delivery: {
        total: delivered.length,
        marketing: delivered.filter((d) => d.type === "marketing").length,
        transactional: delivered.filter((d) => d.type !== "marketing").length,
        opened: delivered.filter((d) => d.readAt).length,
      },
    });
  });
}

export async function POST(request: Request) {
  return withOwner(async (user) => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const title = str(body.title);
    const message = str(body.body);
    const segment = str(body.segment) || "all_opted_in";
    const schedule = str(body.mode) === "schedule";

    if (!title) return fail("Give your notification a title.");
    if (!message) return fail("Write the message your customers will read.");

    const salon = await getSalonById(user.salonId);
    if (!salon) return fail("Salon not found", 404);

    const selectedIds = Array.isArray(body.customerIds)
      ? (body.customerIds as unknown[]).map(Number).filter(Boolean)
      : [];
    const serviceId = num(body.serviceId);
    const recipients = await resolveAudience(user.salonId, segment, selectedIds, serviceId);

    if (schedule) {
      const when = str(body.scheduledFor);
      const at = new Date(when);
      if (!when || Number.isNaN(at.getTime())) return fail("Pick when this should go out.");
      const [campaign] = await db
        .insert(campaigns)
        .values({
          salonId: user.salonId,
          title,
          body: message,
          imageUrl: str(body.imageUrl) || null,
          ctaLabel: str(body.ctaLabel) || null,
          ctaUrl: str(body.ctaUrl) || null,
          segment,
          status: "scheduled",
          audienceCount: recipients.length,
          scheduledFor: at,
          expiresAt: str(body.expiresAt) ? new Date(str(body.expiresAt)) : null,
        })
        .returning();
      return ok({ campaign, scheduled: true, recipients: recipients.length }, 201);
    }

    if (recipients.length === 0) {
      return fail(
        "Nobody in that segment has opted in to offers yet. Encourage customers to turn on notifications from your salon page.",
      );
    }

    const [campaign] = await db
      .insert(campaigns)
      .values({
        salonId: user.salonId,
        title,
        body: message,
        imageUrl: str(body.imageUrl) || null,
        ctaLabel: str(body.ctaLabel) || null,
        ctaUrl: str(body.ctaUrl) || null,
        segment,
        status: "sent",
        audienceCount: recipients.length,
        sentAt: new Date(),
        expiresAt: str(body.expiresAt) ? new Date(str(body.expiresAt)) : null,
      })
      .returning();

    const targetUrl = str(body.ctaUrl) || `/s/${salon.slug}`;

    await db.insert(notifications).values(
      recipients.map((r) => ({
        salonId: user.salonId,
        customerId: r.id,
        campaignId: campaign.id,
        type: "marketing" as const,
        title,
        body: message,
        url: targetUrl,
      })),
    );

    // Deliver over real Web Push in one batch so devices receive it even when
    // the salon PWA is closed.
    const delivery = await sendPushToCustomers(
      recipients.map((r) => r.id),
      {
        title,
        body: message,
        url: targetUrl,
        type: "marketing",
        icon: salon.logoUrl || `/s/${salon.slug}/icon.svg`,
        badge: `/s/${salon.slug}/icon.svg`,
        tag: `hairq-campaign-${campaign.id}`,
      },
    );

    return ok({ campaign, recipients: recipients.length, delivery }, 201);
  });
}

export async function PATCH(request: Request) {
  return withOwner(async (user) => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = num(body.id);
    if (!id) return fail("Missing campaign.");
    if (str(body.action) === "cancel") {
      await db
        .update(campaigns)
        .set({ status: "draft" })
        .where(and(eq(campaigns.id, id), eq(campaigns.salonId, user.salonId)));
      return ok({ ok: true });
    }
    if (str(body.action) === "delete") {
      await db.delete(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.salonId, user.salonId)));
      return ok({ ok: true });
    }
    return fail("Unknown action.");
  });
}
