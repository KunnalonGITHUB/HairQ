import { requestJson } from "@/lib/api-helpers";
import { customerRepository, staffRepository, serviceRepository } from "@/lib/firestore/repositories";
import { and, asc, desc, eq, ilike, or, coalesce } from "@/lib/firestore/query";

import { customers, pushSubscriptions, services, staff } from "@/lib/firestore/fields";
import { fail, num, ok, str, validPhone, withOwner } from "@/lib/api-helpers";
import { upsertCustomer } from "@/lib/salon-data";

export async function GET(request: Request) {
  return withOwner(async (user) => {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const segment = url.searchParams.get("segment") ?? "all";
    const sort = url.searchParams.get("sort") ?? "recent";

    const where = [eq(customers.salonId, user.salonId)];
    if (q) {
      const like = `%${q}%`;
      const match = or(ilike(customers.name, like), ilike(customers.phone, like));
      if (match) where.push(match);
    }

    const order =
      sort === "name"
        ? asc(customers.name)
        : sort === "visits"
          ? desc(customers.totalVisits)
          : sort === "spend"
            ? desc(customers.totalSpend)
            : desc(coalesce(customers.lastActivityAt, customers.createdAt));

    const rows = await customerRepository.find(user.salonId, { select: {
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        email: customers.email,
        notes: customers.notes,
        totalVisits: customers.totalVisits,
        totalSpend: customers.totalSpend,
        loyaltyPoints: customers.loyaltyPoints,
        lastVisitAt: customers.lastVisitAt,
        lastActivityAt: customers.lastActivityAt,
        pwaInstalled: customers.pwaInstalled,
        source: customers.source,
        createdAt: customers.createdAt,
        preferredStaffId: customers.preferredStaffId,
        lastServiceId: customers.lastServiceId,
        queueOptIn: pushSubscriptions.queueOptIn,
        marketingOptIn: pushSubscriptions.marketingOptIn,
        bookingOptIn: pushSubscriptions.bookingOptIn,
        subscribed: pushSubscriptions.id,
      }, joins: [{ table: "pushSubscriptions", on: eq(pushSubscriptions.customerId, customers.id), left: true }], where: and(...where), orderBy: [order], limit: 500 });

    const [team, svc] = await Promise.all([
      staffRepository.find(user.salonId, { select: { id: staff.id, name: staff.name }, where: eq(staff.salonId, user.salonId) }),
      serviceRepository.find(user.salonId, { select: { id: services.id, name: services.name }, where: eq(services.salonId, user.salonId) }),
    ]);
    const staffNames = new Map(team.map((t) => [t.id, t.name]));
    const serviceNames = new Map(svc.map((s) => [s.id, s.name]));

    const now = Date.now();
    const DAY = 86400000;
    const enriched = rows.map((r) => {
      const lastVisit = r.lastVisitAt ? new Date(r.lastVisitAt).getTime() : null;
      return {
        ...r,
        preferredStaffName: r.preferredStaffId ? staffNames.get(r.preferredStaffId) ?? null : null,
        lastServiceName: r.lastServiceId ? serviceNames.get(r.lastServiceId) ?? null : null,
        subscribed: Boolean(r.subscribed),
        daysSinceVisit: lastVisit ? Math.floor((now - lastVisit) / DAY) : null,
      };
    });

    const inSegment = (c: (typeof enriched)[number]) => {
      switch (segment) {
        case "notifications":
          return c.subscribed;
        case "pwa":
          return c.pwaInstalled;
        case "recent":
          return c.daysSinceVisit !== null && c.daysSinceVisit <= 30;
        case "frequent":
          return c.totalVisits >= 4;
        case "inactive":
          return c.daysSinceVisit === null || c.daysSinceVisit > 45;
        case "marketing":
          return c.marketingOptIn === true;
        default:
          return true;
      }
    };

    return ok({
      customers: enriched.filter(inSegment),
      segments: {
        all: enriched.length,
        notifications: enriched.filter((c) => c.subscribed).length,
        marketing: enriched.filter((c) => c.marketingOptIn).length,
        pwa: enriched.filter((c) => c.pwaInstalled).length,
        recent: enriched.filter((c) => c.daysSinceVisit !== null && c.daysSinceVisit <= 30).length,
        frequent: enriched.filter((c) => c.totalVisits >= 4).length,
        inactive: enriched.filter((c) => c.daysSinceVisit === null || c.daysSinceVisit > 45).length,
      },
      staff: team,
      services: svc,
    });
  }, request);
}

export async function POST(request: Request) {
  return withOwner(async (user) => {
    const body = (await requestJson(request).catch(() => ({}))) as Record<string, unknown>;
    const name = str(body.name);
    const phone = str(body.phone);
    if (!name) return fail("Add a name.");
    if (!validPhone(phone)) return fail("Add a valid phone number.");
    const customer = await upsertCustomer({
      salonId: user.salonId,
      name,
      phone,
      email: str(body.email) || null,
      notes: str(body.notes) || null,
      preferredStaffId: num(body.preferredStaffId),
      source: "manual",
    });
    return ok({ customer }, 201);
  }, request);
}
