import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, services } from "@/db/schema";
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
import { addDays, dateKey, parseDateKey, startOfDay } from "@/lib/time";

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

    const now = new Date();
    const today = startOfDay(now);
    const days = Array.from({ length: salon.bookingHorizonDays }, (_, i) => {
      const day = addDays(today, i);
      const h = hours.find((x) => x.dayOfWeek === day.getDay());
      return {
        date: dateKey(day),
        weekday: day.toLocaleDateString("en-US", { weekday: "short" }),
        dayNum: day.getDate(),
        month: day.toLocaleDateString("en-US", { month: "short" }),
        closed: !h || h.isClosed,
      };
    });

    const target = dateParam ? parseDateKey(dateParam) : today;
    const existing = await dayBookings(salon.id, target);

    const slots = buildSlots({
      day: target,
      hours: hours.find((h) => h.dayOfWeek === target.getDay()),
      durationMin: service.durationMin,
      slotIntervalMin: salon.slotIntervalMin,
      staff: catalogue.staff.filter((s) => s.active),
      staffServiceMap: catalogue.staffServiceMap,
      serviceId,
      bookings: existing,
      preferredStaffId: staffId,
      now,
    });

    return ok({
      days,
      date: dateKey(target),
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

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
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

    const svc = await db
      .select()
      .from(services)
      .where(and(eq(services.id, serviceId), eq(services.salonId, salon.id), eq(services.active, true)))
      .limit(1);
    if (!svc[0]) return fail("That service isn't available right now.");

    const existing = await dayBookings(salon.id, scheduledAt);
    const catalogue = await getCatalogue(salon.id);
    const hours = await getHours(salon.id);

    const openSlots = buildSlots({
      day: scheduledAt,
      hours: hours.find((h) => h.dayOfWeek === scheduledAt.getDay()),
      durationMin: svc[0].durationMin,
      slotIntervalMin: salon.slotIntervalMin,
      staff: catalogue.staff.filter((s) => s.active),
      staffServiceMap: catalogue.staffServiceMap,
      serviceId,
      bookings: existing,
      preferredStaffId: staffId,
      now: new Date(),
    });
    const match = openSlots.find((s) => new Date(s.time).getTime() === scheduledAt.getTime());
    if (!match) {
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

    const [booking] = await db
      .insert(bookings)
      .values({
        salonId: salon.id,
        customerId: customer.id,
        serviceId,
        staffId: assignedStaff,
        token: newToken(10),
        scheduledAt,
        durationMin: svc[0].durationMin,
        source: "online",
        notes: str(body.notes) || null,
      })
      .returning();

    await pushNotification({
      salonId: salon.id,
      customerId: customer.id,
      type: "booking",
      title: "Appointment Confirmed 📅",
      body: `${svc[0].name} on ${scheduledAt.toLocaleDateString("en-US", {
        weekday: "long",
      })} at ${scheduledAt.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })}.\nWe've saved your chair at ${salon.name}.`,
      url: `/s/${salon.slug}/b/${booking.token}`,
    });

    return ok({ token: booking.token, customerId: customer.id }, 201);
  });
}
