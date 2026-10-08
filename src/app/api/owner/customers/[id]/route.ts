import { publicSubscription } from "@/lib/firestore/public-dto";
import { requestJson } from "@/lib/api-helpers";
import { customerRepository, visitRepository, bookingRepository, queueRepository, pushSubscriptionRepository, staffRepository, serviceRepository, notificationRepository } from "@/lib/firestore/repositories";
import { and, desc, eq, gte, inArray } from "@/lib/firestore/query";

import {
  bookings,
  customers,
  notifications,
  pushSubscriptions,
  queueEntries,
  services,
  staff,
  visits,
} from "@/lib/firestore/fields";
import { fail, num, ok, str, withOwner } from "@/lib/api-helpers";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return withOwner(async (user) => {
    const { id } = await ctx.params;
    const customerId = Number(id);

    const rows = await customerRepository.find(user.salonId, { where: and(eq(customers.id, customerId), eq(customers.salonId, user.salonId)), limit: 1 });
    const customer = rows[0];
    if (!customer) return fail("We couldn't find that customer.", 404);

    const [visitRows, bookingRows, queueRows, sub, team, svc, notes] = await Promise.all([
      visitRepository.find(user.salonId, { select: {
          id: visits.id,
          completedAt: visits.completedAt,
          amount: visits.amount,
          durationMin: visits.durationMin,
          waitMin: visits.waitMin,
          source: visits.source,
          serviceId: visits.serviceId,
          staffId: visits.staffId,
        }, where: eq(visits.customerId, customerId), orderBy: [desc(visits.completedAt)], limit: 40 }),
      bookingRepository.find(user.salonId, { select: {
          id: bookings.id,
          scheduledAt: bookings.scheduledAt,
          status: bookings.status,
          serviceId: bookings.serviceId,
          staffId: bookings.staffId,
          durationMin: bookings.durationMin,
        }, where: and(
            eq(bookings.customerId, customerId),
            gte(bookings.scheduledAt, new Date()),
            inArray(bookings.status, ["confirmed", "arrived"]),
          ), orderBy: [bookings.scheduledAt], limit: 5 }),
      queueRepository.find(user.salonId, { select: { id: queueEntries.id, status: queueEntries.status, token: queueEntries.token }, where: and(
            eq(queueEntries.customerId, customerId),
            inArray(queueEntries.status, ["waiting", "serving"]),
          ), limit: 1 }),
      pushSubscriptionRepository.find(user.salonId, { where: eq(pushSubscriptions.customerId, customerId), limit: 1 }),
      staffRepository.find(user.salonId, { select: { id: staff.id, name: staff.name }, where: eq(staff.salonId, user.salonId) }),
      serviceRepository.find(user.salonId, { select: { id: services.id, name: services.name, price: services.price }, where: eq(services.salonId, user.salonId) }),
      notificationRepository.find(user.salonId, { select: {
          id: notifications.id,
          title: notifications.title,
          type: notifications.type,
          deliveredAt: notifications.deliveredAt,
        }, where: eq(notifications.customerId, customerId), orderBy: [desc(notifications.deliveredAt)], limit: 10 }),
    ]);

    const staffNames = new Map(team.map((t) => [t.id, t.name]));
    const serviceNames = new Map(svc.map((s) => [s.id, s.name]));

    const serviceTally = new Map<string, number>();
    for (const v of visitRows) {
      const key = v.serviceId ? serviceNames.get(v.serviceId) ?? "Service" : "Service";
      serviceTally.set(key, (serviceTally.get(key) ?? 0) + 1);
    }

    return ok({
      customer: {
        ...customer,
        preferredStaffName: customer.preferredStaffId
          ? staffNames.get(customer.preferredStaffId) ?? null
          : null,
      },
      visits: visitRows.map((v) => ({
        ...v,
        serviceName: v.serviceId ? serviceNames.get(v.serviceId) ?? "Service" : "Service",
        staffName: v.staffId ? staffNames.get(v.staffId) ?? null : null,
      })),
      upcoming: bookingRows.map((b) => ({
        ...b,
        serviceName: serviceNames.get(b.serviceId) ?? "Service",
        staffName: b.staffId ? staffNames.get(b.staffId) ?? null : null,
      })),
      inQueue: queueRows[0] ?? null,
      subscription: publicSubscription(sub[0]),
      notifications: notes,
      favouriteServices: [...serviceTally.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => ({ name, count })),
      staff: team,
      services: svc,
    });
  }, _request);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return withOwner(async (user) => {
    const { id } = await ctx.params;
    const customerId = Number(id);
    const body = (await requestJson(request).catch(() => ({}))) as Record<string, unknown>;

    const patch: Record<string, unknown> = {};
    if ("name" in body) {
      const name = str(body.name);
      if (!name) return fail("Name can't be empty.");
      patch.name = name;
    }
    if ("phone" in body) patch.phone = str(body.phone);
    if ("email" in body) patch.email = str(body.email) || null;
    if ("notes" in body) patch.notes = str(body.notes) || null;
    if ("birthday" in body) patch.birthday = str(body.birthday) || null;
    if ("preferredStaffId" in body) patch.preferredStaffId = num(body.preferredStaffId);
    if (Object.keys(patch).length === 0) return fail("Nothing to update.");

    const [updated] = await customerRepository.update(user.salonId, and(eq(customers.id, customerId), eq(customers.salonId, user.salonId)), patch);
    if (!updated) return fail("We couldn't find that customer.", 404);
    return ok({ customer: updated });
  }, request);
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return withOwner(async (user) => {
    const { id } = await ctx.params;
    await customerRepository.remove(user.salonId, and(eq(customers.id, Number(id)), eq(customers.salonId, user.salonId)));
    return ok({ ok: true });
  }, _request);
}
