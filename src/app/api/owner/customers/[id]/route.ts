import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  customers,
  notifications,
  pushSubscriptions,
  queueEntries,
  services,
  staff,
  visits,
} from "@/db/schema";
import { fail, num, ok, str, withOwner } from "@/lib/api-helpers";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return withOwner(async (user) => {
    const { id } = await ctx.params;
    const customerId = Number(id);

    const rows = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.salonId, user.salonId)))
      .limit(1);
    const customer = rows[0];
    if (!customer) return fail("We couldn't find that customer.", 404);

    const [visitRows, bookingRows, queueRows, sub, team, svc, notes] = await Promise.all([
      db
        .select({
          id: visits.id,
          completedAt: visits.completedAt,
          amount: visits.amount,
          durationMin: visits.durationMin,
          waitMin: visits.waitMin,
          source: visits.source,
          serviceId: visits.serviceId,
          staffId: visits.staffId,
        })
        .from(visits)
        .where(eq(visits.customerId, customerId))
        .orderBy(desc(visits.completedAt))
        .limit(40),
      db
        .select({
          id: bookings.id,
          scheduledAt: bookings.scheduledAt,
          status: bookings.status,
          serviceId: bookings.serviceId,
          staffId: bookings.staffId,
          durationMin: bookings.durationMin,
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.customerId, customerId),
            gte(bookings.scheduledAt, new Date()),
            inArray(bookings.status, ["confirmed", "arrived"]),
          ),
        )
        .orderBy(bookings.scheduledAt)
        .limit(5),
      db
        .select({ id: queueEntries.id, status: queueEntries.status, token: queueEntries.token })
        .from(queueEntries)
        .where(
          and(
            eq(queueEntries.customerId, customerId),
            inArray(queueEntries.status, ["waiting", "serving"]),
          ),
        )
        .limit(1),
      db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.customerId, customerId))
        .limit(1),
      db.select({ id: staff.id, name: staff.name }).from(staff).where(eq(staff.salonId, user.salonId)),
      db
        .select({ id: services.id, name: services.name, price: services.price })
        .from(services)
        .where(eq(services.salonId, user.salonId)),
      db
        .select({
          id: notifications.id,
          title: notifications.title,
          type: notifications.type,
          deliveredAt: notifications.deliveredAt,
        })
        .from(notifications)
        .where(eq(notifications.customerId, customerId))
        .orderBy(desc(notifications.deliveredAt))
        .limit(10),
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
      subscription: sub[0] ?? null,
      notifications: notes,
      favouriteServices: [...serviceTally.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => ({ name, count })),
      staff: team,
      services: svc,
    });
  });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return withOwner(async (user) => {
    const { id } = await ctx.params;
    const customerId = Number(id);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

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

    const [updated] = await db
      .update(customers)
      .set(patch)
      .where(and(eq(customers.id, customerId), eq(customers.salonId, user.salonId)))
      .returning();
    if (!updated) return fail("We couldn't find that customer.", 404);
    return ok({ customer: updated });
  });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return withOwner(async (user) => {
    const { id } = await ctx.params;
    await db
      .delete(customers)
      .where(and(eq(customers.id, Number(id)), eq(customers.salonId, user.salonId)));
    return ok({ ok: true });
  });
}
