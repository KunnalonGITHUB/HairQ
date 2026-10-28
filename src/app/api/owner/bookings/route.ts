import { requestJson } from "@/lib/api-helpers";
import { bookingRepository, staffRepository, serviceRepository } from "@/lib/firestore/repositories";
import { and, asc, desc, eq, gte, inArray, lte } from "@/lib/firestore/query";

import { bookings, customers, services, staff } from "@/lib/firestore/fields";
import { fail, num, ok, str, validPhone, withOwner } from "@/lib/api-helpers";
import { newToken } from "@/lib/auth";
import { dayBookings, getSalonById, pushNotification, upsertCustomer } from "@/lib/salon-data";
import { isOnSlotGrid, isSlotTaken } from "@/lib/availability";
import { formatSalonDate, formatSalonTime, salonEndOfDay, salonStartOfDay } from "@/lib/salon-time";

const selection = {
  id: bookings.id,
  token: bookings.token,
  scheduledAt: bookings.scheduledAt,
  durationMin: bookings.durationMin,
  status: bookings.status,
  source: bookings.source,
  notes: bookings.notes,
  createdAt: bookings.createdAt,
  customerId: customers.id,
  customerName: customers.name,
  customerPhone: customers.phone,
  totalVisits: customers.totalVisits,
  serviceId: services.id,
  serviceName: services.name,
  servicePrice: services.price,
  staffId: bookings.staffId,
};

export async function GET(request: Request) {
  return withOwner(async (user) => {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") ?? "today";
    const now = new Date();

    const base = [eq(bookings.salonId, user.salonId)];
    if (scope === "today") {
      base.push(gte(bookings.scheduledAt, salonStartOfDay(now)), lte(bookings.scheduledAt, salonEndOfDay(now)));
      base.push(inArray(bookings.status, ["confirmed", "arrived", "completed", "cancelled"]));
    } else if (scope === "upcoming") {
      base.push(gte(bookings.scheduledAt, salonEndOfDay(now)));
      base.push(inArray(bookings.status, ["confirmed", "arrived"]));
    } else if (scope === "completed") {
      base.push(eq(bookings.status, "completed"));
    } else if (scope === "cancelled") {
      base.push(inArray(bookings.status, ["cancelled", "no_show"]));
    }

    const rows = await bookingRepository.find(user.salonId, { select: selection, joins: [{ table: "customers", on: eq(customers.id, bookings.customerId), left: false }, { table: "services", on: eq(services.id, bookings.serviceId), left: false }], where: and(...base), orderBy: [scope === "completed" || scope === "cancelled" ? desc(bookings.scheduledAt) : asc(bookings.scheduledAt)], limit: 200 });

    const team = await staffRepository.find(user.salonId, { where: eq(staff.salonId, user.salonId) });
    const names = new Map(team.map((t) => [t.id, t.name]));

    const counts = await bookingRepository.find(user.salonId, { select: { status: bookings.status, scheduledAt: bookings.scheduledAt }, where: eq(bookings.salonId, user.salonId) });

    return ok({
      bookings: rows.map((r) => ({ ...r, staffName: r.staffId ? names.get(r.staffId) ?? null : null })),
      counts: {
        today: counts.filter(
          (c) =>
            c.scheduledAt >= salonStartOfDay(now) &&
            c.scheduledAt <= salonEndOfDay(now) &&
            !["cancelled", "no_show"].includes(c.status),
        ).length,
        upcoming: counts.filter(
          (c) => c.scheduledAt > salonEndOfDay(now) && ["confirmed", "arrived"].includes(c.status),
        ).length,
        completed: counts.filter((c) => c.status === "completed").length,
        cancelled: counts.filter((c) => ["cancelled", "no_show"].includes(c.status)).length,
      },
    });
  }, request);
}

export async function POST(request: Request) {
  return withOwner(async (user) => {
    const body = (await requestJson(request).catch(() => ({}))) as Record<string, unknown>;
    const name = str(body.name);
    const phone = str(body.phone);
    const serviceId = num(body.serviceId);
    const staffId = num(body.staffId);
    const when = str(body.scheduledAt);

    if (!name) return fail("Add the customer's name.");
    if (!validPhone(phone)) return fail("Add a valid phone number.");
    if (!serviceId) return fail("Choose a service.");
    if (!when) return fail("Choose a date and time.");

    const scheduledAt = new Date(when);
    if (Number.isNaN(scheduledAt.getTime())) return fail("That date and time didn't look right.");
    if (!isOnSlotGrid(scheduledAt)) return fail("Appointments start on the hour or half hour, like 4:00 or 4:30.");

    const salon = await getSalonById(user.salonId);
    if (!salon) return fail("Salon not found", 404);

    const svc = await serviceRepository.find(user.salonId, { where: and(eq(services.id, serviceId), eq(services.salonId, user.salonId)), limit: 1 });
    if (!svc[0]) return fail("That service isn't on your menu.");

    const existing = await dayBookings(user.salonId, scheduledAt);
    if (staffId && isSlotTaken({ scheduledAt, durationMin: svc[0].durationMin, staffId, bookings: existing })) {
      return fail("That barber already has an appointment at this time.", 409);
    }

    const customer = await upsertCustomer({
      salonId: user.salonId,
      name,
      phone,
      source: "booking",
      preferredStaffId: staffId,
    });

    const [booking] = await bookingRepository.create(user.salonId, {
        salonId: user.salonId,
        customerId: customer.id,
        serviceId,
        staffId: staffId ?? null,
        token: newToken(10),
        scheduledAt,
        durationMin: svc[0].durationMin,
        source: "manual",
        notes: str(body.notes) || null,
      });

    await pushNotification({
      salonId: user.salonId,
      customerId: customer.id,
      type: "booking",
      title: "Appointment Confirmed 📅",
      body: `${svc[0].name} on ${formatSalonDate(scheduledAt, {
        weekday: "long",
      })} at ${formatSalonTime(scheduledAt)}.\nWe've saved your chair at ${salon.name}.`,
      url: `/s/${salon.slug}/b/${booking.token}`,
    });

    return ok({ booking }, 201);
  }, request);
}
