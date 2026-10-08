import { requestJson } from "@/lib/api-helpers";
import { customerRepository, visitRepository, campaignRepository, notificationRepository } from "@/lib/firestore/repositories";
import { and, desc, eq, inArray } from "@/lib/firestore/query";

import { campaigns, customers, notifications, pushSubscriptions, visits } from "@/lib/firestore/fields";
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
  const rows = await customerRepository.find(salonId, { select: {
      id: customers.id,
      name: customers.name,
      totalVisits: customers.totalVisits,
      lastVisitAt: customers.lastVisitAt,
      marketingOptIn: pushSubscriptions.marketingOptIn,
    }, joins: [{ table: "pushSubscriptions", on: eq(pushSubscriptions.customerId, customers.id), left: false }], where: and(eq(customers.salonId, salonId), eq(pushSubscriptions.marketingOptIn, true)) });

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
    const used = await visitRepository.find(salonId, { select: { customerId: visits.customerId }, where: and(eq(visits.salonId, salonId), eq(visits.serviceId, serviceId)) });
    const ids = new Set(used.map((u) => u.customerId));
    return rows.filter((r) => ids.has(r.id));
  }
  return rows;
}

export async function GET(request: Request) {
  return withOwner(async (user) => {
    const [rows, optedIn, delivered] = await Promise.all([
      campaignRepository.find(user.salonId, { where: eq(campaigns.salonId, user.salonId), orderBy: [desc(campaigns.createdAt)], limit: 50 }),
      customerRepository.find(user.salonId, { select: {
          id: customers.id,
          name: customers.name,
          phone: customers.phone,
          totalVisits: customers.totalVisits,
          lastVisitAt: customers.lastVisitAt,
          marketingOptIn: pushSubscriptions.marketingOptIn,
        }, joins: [{ table: "pushSubscriptions", on: eq(pushSubscriptions.customerId, customers.id), left: false }], where: and(eq(customers.salonId, user.salonId), eq(pushSubscriptions.marketingOptIn, true)) }),
      notificationRepository.find(user.salonId, { select: { id: notifications.id, type: notifications.type, readAt: notifications.readAt }, where: eq(notifications.salonId, user.salonId) }),
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
  }, request);
}

export async function POST(request: Request) {
  return withOwner(async (user) => {
    const body = (await requestJson(request).catch(() => ({}))) as Record<string, unknown>;
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
      const [campaign] = await campaignRepository.create(user.salonId, {
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
        });
      return ok({ campaign, scheduled: true, recipients: recipients.length }, 201);
    }

    if (recipients.length === 0) {
      return fail(
        "Nobody in that segment has opted in to offers yet. Encourage customers to turn on notifications from your salon page.",
      );
    }

    const [campaign] = await campaignRepository.create(user.salonId, {
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
      });

    const targetUrl = str(body.ctaUrl) || `/s/${salon.slug}`;

    await notificationRepository.create(user.salonId, recipients.map((r) => ({
        salonId: user.salonId,
        customerId: r.id,
        campaignId: campaign.id,
        type: "marketing" as const,
        title,
        body: message,
        url: targetUrl,
      })));

    // Deliver over real Web Push in one batch so devices receive it even when
    // the salon PWA is closed.
    const delivery = await sendPushToCustomers(
      user.salonId,
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
  }, request);
}

export async function PATCH(request: Request) {
  return withOwner(async (user) => {
    const body = (await requestJson(request).catch(() => ({}))) as Record<string, unknown>;
    const id = num(body.id);
    if (!id) return fail("Missing campaign.");
    if (str(body.action) === "cancel") {
      await campaignRepository.update(user.salonId, and(eq(campaigns.id, id), eq(campaigns.salonId, user.salonId)), { status: "draft" });
      return ok({ ok: true });
    }
    if (str(body.action) === "delete") {
      await campaignRepository.remove(user.salonId, and(eq(campaigns.id, id), eq(campaigns.salonId, user.salonId)));
      return ok({ ok: true });
    }
    return fail("Unknown action.");
  }, request);
}
