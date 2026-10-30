import { requestJson } from "@/lib/api-helpers";
import { bookingRepository, queueRepository, completeVisit, linkBookingQueue, type CompletionExtra } from "@/lib/firestore/repositories";
import { and, eq, inArray } from "@/lib/firestore/query";

import { bookings, queueEntries } from "@/lib/firestore/fields";
import { fail, num, ok, str, withOwner } from "@/lib/api-helpers";
import { newToken } from "@/lib/auth";
import { getSalonById, nextQueuePosition, pushNotification } from "@/lib/salon-data";
import { syncQueueNotifications } from "@/lib/queue-actions";
import { isOnSlotGrid } from "@/lib/availability";
import { formatSalonDate, formatSalonTime } from "@/lib/salon-time";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return withOwner(async (user) => {
    const { id } = await ctx.params;
    const bookingId = Number(id);
    const body = (await requestJson(request).catch(() => ({}))) as Record<string, unknown>;
    const action = str(body.action);

    const rows = await bookingRepository.find(user.salonId, { where: and(eq(bookings.id, bookingId), eq(bookings.salonId, user.salonId)), limit: 1 });
    const booking = rows[0];
    if (!booking) return fail("That appointment no longer exists.", 404);

    const salon = await getSalonById(user.salonId);
    if (!salon) return fail("Salon not found", 404);

    switch (action) {
      case "confirm":
        await bookingRepository.update(user.salonId, eq(bookings.id, bookingId), { status: "confirmed" });
        break;
      case "arrive":
        await bookingRepository.update(user.salonId, eq(bookings.id, bookingId), { status: "arrived" });
        break;
      case "cancel": {
        await bookingRepository.update(user.salonId, eq(bookings.id, bookingId), { status: "cancelled" });
        await pushNotification({
          salonId: user.salonId,
          customerId: booking.customerId,
          type: "booking",
          title: "Appointment Cancelled 📅",
          body: `${salon.name} had to cancel your appointment.\nPlease call us and we'll find a new time.`,
          url: `/s/${salon.slug}`,
        });
        break;
      }
      case "reschedule": {
        const when = str(body.scheduledAt);
        const next = new Date(when);
        if (!when || Number.isNaN(next.getTime())) return fail("Pick a new date and time.");
        if (!isOnSlotGrid(next)) return fail("Appointments start on the hour or half hour, like 4:00 or 4:30.");
        await bookingRepository.update(user.salonId, eq(bookings.id, bookingId), { status: "confirmed", scheduledAt: next });
        await pushNotification({
          salonId: user.salonId,
          customerId: booking.customerId,
          type: "booking",
          title: "Appointment Moved 📅",
          body: `New time: ${formatSalonDate(next, {
            weekday: "long",
          })} at ${formatSalonTime(next)}.\nRescheduled by ${salon.name}.`,
          url: `/s/${salon.slug}/b/${booking.token}`,
        });
        break;
      }
      case "add_to_queue": {
        if (!["confirmed", "arrived"].includes(booking.status)) return fail("That appointment has already ended.", 409);
        const already = await queueRepository.find(user.salonId, { select: { id: queueEntries.id }, where: and(
              eq(queueEntries.salonId, user.salonId),
              eq(queueEntries.customerId, booking.customerId),
              inArray(queueEntries.status, ["waiting", "serving"]),
            ), limit: 1 });
        if (already.length > 0) return fail("This customer is already in the live queue.", 409);
        const position = await nextQueuePosition(user.salonId);
        const [queueEntry] = await queueRepository.create(user.salonId, {
          salonId: user.salonId,
          customerId: booking.customerId,
          serviceId: booking.serviceId,
          staffId: booking.staffId,
          token: newToken(10),
          durationMin: booking.durationMin,
          source: "booking",
          position,
        });
        await linkBookingQueue(user.salonId, bookingId, queueEntry.id);
        await bookingRepository.update(user.salonId, eq(bookings.id, bookingId), { status: "arrived" });
        await syncQueueNotifications(user.salonId, salon.name, salon.slug);
        break;
      }
      case "complete": {
        // Optional extras: catalogue services by id (price looked up on the server)
        // or custom { name, price }. The total is computed in the transaction.
        const raw = Array.isArray(body.extraServices) ? (body.extraServices as unknown[]) : [];
        const extras: CompletionExtra[] = [];
        for (const item of raw) {
          const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
          const serviceId = num(row.serviceId);
          if (serviceId !== null) extras.push({ serviceId });
          else extras.push({ name: str(row.name), price: num(row.price) ?? Number.NaN });
        }
        await completeVisit(user.salonId, "bookings", bookingId, extras);
        break;
      }
      case "no_show": {
        await bookingRepository.update(user.salonId, eq(bookings.id, bookingId), { status: "no_show" });
        break;
      }
      case "update": {
        const patch: Record<string, unknown> = {};
        if ("staffId" in body) patch.staffId = num(body.staffId);
        if ("notes" in body) patch.notes = str(body.notes) || null;
        if (Object.keys(patch).length === 0) return fail("Nothing to update.");
        await bookingRepository.update(user.salonId, eq(bookings.id, bookingId), patch);
        break;
      }
      default:
        return fail("Unknown action.");
    }

    return ok({ ok: true });
  }, request);
}
