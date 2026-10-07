import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bookings, customers, pushSubscriptions, queueEntries, services, staff, visits } from "@/db/schema";
import { fail, guarded, ok, str, validPhone } from "@/lib/api-helpers";
import { getSalonBySlug } from "@/lib/salon-data";

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return guarded(async () => {
    const { slug } = await ctx.params;
    const salon = await getSalonBySlug(slug);
    if (!salon) return fail("We couldn't find that salon link.", 404);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const phone = str(body.phone).replace(/[^\d+]/g, "");
    if (!validPhone(phone)) return fail("Enter the phone number you used at the salon.");

    const rows = await db
      .select()
      .from(customers)
      .where(and(eq(customers.salonId, salon.id), eq(customers.phone, phone)))
      .limit(1);
    const customer = rows[0];
    if (!customer) {
      return fail("We couldn't find a visit with that number yet.", 404);
    }

    const [visitRows, upcoming, active, svc, team, sub] = await Promise.all([
      db
        .select({
          id: visits.id,
          completedAt: visits.completedAt,
          amount: visits.amount,
          serviceId: visits.serviceId,
          staffId: visits.staffId,
        })
        .from(visits)
        .where(eq(visits.customerId, customer.id))
        .orderBy(desc(visits.completedAt))
        .limit(12),
      db
        .select({
          token: bookings.token,
          scheduledAt: bookings.scheduledAt,
          status: bookings.status,
          serviceId: bookings.serviceId,
          staffId: bookings.staffId,
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.customerId, customer.id),
            gte(bookings.scheduledAt, new Date()),
            inArray(bookings.status, ["confirmed", "arrived"]),
          ),
        )
        .orderBy(bookings.scheduledAt)
        .limit(5),
      db
        .select({ token: queueEntries.token, status: queueEntries.status })
        .from(queueEntries)
        .where(
          and(
            eq(queueEntries.customerId, customer.id),
            inArray(queueEntries.status, ["waiting", "serving"]),
          ),
        )
        .limit(1),
      db.select({ id: services.id, name: services.name }).from(services).where(eq(services.salonId, salon.id)),
      db.select({ id: staff.id, name: staff.name }).from(staff).where(eq(staff.salonId, salon.id)),
      db.select().from(pushSubscriptions).where(eq(pushSubscriptions.customerId, customer.id)).limit(1),
    ]);

    const serviceNames = new Map(svc.map((s) => [s.id, s.name]));
    const staffNames = new Map(team.map((s) => [s.id, s.name]));

    return ok({
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        totalVisits: customer.totalVisits,
        loyaltyPoints: customer.loyaltyPoints,
        lastVisitAt: customer.lastVisitAt,
      },
      visits: visitRows.map((v) => ({
        ...v,
        serviceName: v.serviceId ? serviceNames.get(v.serviceId) ?? "Service" : "Service",
        staffName: v.staffId ? staffNames.get(v.staffId) ?? null : null,
      })),
      upcoming: upcoming.map((b) => ({
        ...b,
        serviceName: serviceNames.get(b.serviceId) ?? "Service",
        staffName: b.staffId ? staffNames.get(b.staffId) ?? null : null,
      })),
      activeQueue: active[0] ?? null,
      subscription: sub[0] ?? null,
    });
  });
}
