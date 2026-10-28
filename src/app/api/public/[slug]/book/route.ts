import { requestJson } from "@/lib/api-helpers";
import { serviceRepository, bookingRepository } from "@/lib/firestore/repositories";
import { and, eq } from "@/lib/firestore/query";

import { bookings, services } from "@/lib/firestore/fields";
import { fail, guarded, num, ok, str, validPhone } from "@/lib/api-helpers";
import { newToken } from "@/lib/auth";
import { buildSlots, isSlotTaken } from "@/lib/availability";
import {
  dayBookings,
  getCatalogue,
  getHours,
  getSalonBySlug,
  pushNotification,
  upsertCustomer,
} from "@/lib/salon-data";
import {
  addDaysToKey,
  formatSalonDate,
  formatSalonTime,
  isSalonDateKey,
  salonClock,
  salonDateKey,
  salonDayStart,
  salonEndOfDay,
  salonWeekday,
} from "@/lib/salon-time";

export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return guarded(async () => {
    const { slug } = await ctx.params;
    const salon = await getSalonBySlug(slug);
    if (!salon) return fail("We couldn't find that salon link.", 404);

    const url = new URL(request.url);
    const serviceId = Number(url.searchParams.get("serviceId"));
    const staffParam = url.searchParams.get("staffId");
    const staffId = staffParam && staffParam !== "any" ? Number(staffParam) : null;
    const dateParam = url.searchParams.get("date");

    if (!serviceId) return fail("Choose a service first.");

    const [hours, catalogue] = await Promise.all([getHours(salon.id), getCatalogue(salon.id)]);
    const service = catalogue.services.find((s) => s.id === serviceId && s.active);
    if (!service) return fail("That service isn't available right now.");

    // Days and dates are the salon's (Asia/Kolkata), whatever the server's timezone.
    const now = new Date();
    const todayKey = salonDateKey(now);
    const days = Array.from({ length: salon.bookingHorizonDays }, (_, i) => {
      const key = addDaysToKey(todayKey, i);
      const day = salonDayStart(key);
      const h = hours.find((x) => x.dayOfWeek === salonWeekday(day));
      return {
        date: key,
        weekday: formatSalonDate(day, { weekday: "short" }),
        dayNum: salonClock(day).day,
        month: formatSalonDate(day, { month: "short" }),
        closed: !h || h.isClosed,
      };
    });

    const targetKey = dateParam && isSalonDateKey(dateParam) ? dateParam : todayKey;
    const target = salonDayStart(targetKey);
    const existing = await dayBookings(salon.id, target);

    const slots = buildSlots({
      day: target,
      hours: hours.find((h) => h.dayOfWeek === salonWeekday(target)),
      durationMin: service.durationMin,
      staff: catalogue.staff.filter((s) => s.active),
      staffServiceMap: catalogue.staffServiceMap,
      serviceId,
      bookings: existing,
      preferredStaffId: staffId,
      now,
    });

    return ok({
      days,
      date: targetKey,
      slots,
      service: { id: service.id, name: service.name, durationMin: service.durationMin, price: service.price },
      acceptingBookings: salon.acceptingBookings,
    });
  });
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return guarded(async () => {
    const { slug } = await ctx.params;
    const salon = await getSalonBySlug(slug);
    if (!salon) return fail("We couldn't find that salon link.", 404);
    if (!salon.acceptingBookings) {
      return fail("This salon isn't taking online appointments right now.", 409);
    }

    const body = (await requestJson(request).catch(() => ({}))) as Record<string, unknown>;
    const name = str(body.name);
    const phone = str(body.phone);
    const serviceId = num(body.serviceId);
    const staffId = num(body.staffId);
    const when = str(body.scheduledAt);

    if (!name) return fail("Please tell us your name.");
    if (!validPhone(phone)) return fail("Please enter a valid phone number.");
    if (!serviceId) return fail("Choose a service.");
    if (!when) return fail("Pick a time slot.");

    const scheduledAt = new Date(when);
    if (Number.isNaN(scheduledAt.getTime())) return fail("That time slot didn't look right.");
    if (scheduledAt.getTime() < Date.now()) return fail("That time has already passed. Pick another slot.");
    // Last millisecond of the final salon day in the booking window.
    const latest = salonEndOfDay(salonDayStart(addDaysToKey(salonDateKey(new Date()), salon.bookingHorizonDays - 1)));
    if (scheduledAt > latest) return fail("That date is outside this salon's booking window.", 400);

    const svc = await serviceRepository.find(salon.id, { where: and(eq(services.id, serviceId), eq(services.salonId, salon.id), eq(services.active, true)), limit: 1 });
    if (!svc[0]) return fail("That service isn't available right now.");

    const existing = await dayBookings(salon.id, scheduledAt);
    const catalogue = await getCatalogue(salon.id);
    const hours = await getHours(salon.id);

    const openSlots = buildSlots({
      day: scheduledAt,
      hours: hours.find((h) => h.dayOfWeek === salonWeekday(scheduledAt)),
      durationMin: svc[0].durationMin,
      staff: catalogue.staff.filter((s) => s.active),
      staffServiceMap: catalogue.staffServiceMap,
      serviceId,
      bookings: existing,
      preferredStaffId: staffId,
      now: new Date(),
    });
    const match = openSlots.find((s) => new Date(s.time).getTime() === scheduledAt.getTime());
    if (!match) {
      return fail("That time isn't available for booking. Please pick another slot.", 400);
    }
    if (!match.available) {
      return fail("That slot was just taken. Please choose another time.", 409);
    }

    const assignedStaff = staffId ?? match.staffIds[0] ?? null;
    if (
      assignedStaff &&
      isSlotTaken({ scheduledAt, durationMin: svc[0].durationMin, staffId: assignedStaff, bookings: existing })
    ) {
      return fail("That slot was just taken. Please choose another time.", 409);
    }

    const customer = await upsertCustomer({
      salonId: salon.id,
      name,
      phone,
      source: "booking",
      preferredStaffId: staffId,
    });

    const [booking] = await bookingRepository.create(salon.id, {
        salonId: salon.id,
        customerId: customer.id,
        serviceId,
        staffId: assignedStaff,
        token: newToken(10),
        scheduledAt,
        durationMin: svc[0].durationMin,
        source: "online",
        notes: str(body.notes) || null,
      });

    await pushNotification({
      salonId: salon.id,
      customerId: customer.id,
      type: "booking",
      title: "Appointment Confirmed 📅",
      body: `${svc[0].name} on ${formatSalonDate(scheduledAt, {
        weekday: "long",
      })} at ${formatSalonTime(scheduledAt)}.\nWe've saved your chair at ${salon.name}.`,
      url: `/s/${salon.slug}/b/${booking.token}`,
    });

    return ok({ token: booking.token, customerId: customer.id }, 201);
  });
}
