import { publicSubscription } from "@/lib/firestore/public-dto";
import { requestJson } from "@/lib/api-helpers";
import { customerRepository, visitRepository, bookingRepository, queueRepository, serviceRepository, staffRepository, pushSubscriptionRepository } from "@/lib/firestore/repositories";
import { and, desc, eq, gte, inArray } from "@/lib/firestore/query";

import { bookings, customers, pushSubscriptions, queueEntries, services, staff, visits } from "@/lib/firestore/fields";
import { fail, guarded, ok, str, validPhone } from "@/lib/api-helpers";
import { getSalonBySlug } from "@/lib/salon-data";

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return guarded(async () => {
    const { slug } = await ctx.params;
    const salon = await getSalonBySlug(slug);
    if (!salon) return fail("We couldn't find that salon link.", 404);

    const body = (await requestJson(request).catch(() => ({}))) as Record<string, unknown>;
    const phone = str(body.phone).replace(/[^\d+]/g, "");
    if (!validPhone(phone)) return fail("Enter the phone number you used at the salon.");

    const rows = await customerRepository.find(salon.id, { where: and(eq(customers.salonId, salon.id), eq(customers.phone, phone)), limit: 1 });
    const customer = rows[0];
    if (!customer) {
      return fail("We couldn't find a visit with that number yet.", 404);
    }

    const [visitRows, upcoming, active, svc, team, sub] = await Promise.all([
      visitRepository.find(salon.id, { select: {
          id: visits.id,
          completedAt: visits.completedAt,
          amount: visits.amount,
          serviceId: visits.serviceId,
          staffId: visits.staffId,
        }, where: eq(visits.customerId, customer.id), orderBy: [desc(visits.completedAt)], limit: 12 }),
      bookingRepository.find(salon.id, { select: {
          token: bookings.token,
          scheduledAt: bookings.scheduledAt,
          status: bookings.status,
          serviceId: bookings.serviceId,
          staffId: bookings.staffId,
        }, where: and(
            eq(bookings.customerId, customer.id),
            gte(bookings.scheduledAt, new Date()),
            inArray(bookings.status, ["confirmed", "arrived"]),
          ), orderBy: [bookings.scheduledAt], limit: 5 }),
      queueRepository.find(salon.id, { select: { token: queueEntries.token, status: queueEntries.status }, where: and(
            eq(queueEntries.customerId, customer.id),
            inArray(queueEntries.status, ["waiting", "serving"]),
          ), limit: 1 }),
      serviceRepository.find(salon.id, { select: { id: services.id, name: services.name }, where: eq(services.salonId, salon.id) }),
      staffRepository.find(salon.id, { select: { id: staff.id, name: staff.name }, where: eq(staff.salonId, salon.id) }),
      pushSubscriptionRepository.find(salon.id, { where: eq(pushSubscriptions.customerId, customer.id), limit: 1 }),
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
      subscription: publicSubscription(sub[0]),
    });
  });
}
