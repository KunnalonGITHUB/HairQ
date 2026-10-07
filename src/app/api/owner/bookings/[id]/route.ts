import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, customers, queueEntries, services, visits } from "@/db/schema";
import { fail, num, ok, str, withOwner } from "@/lib/api-helpers";
import { newToken } from "@/lib/auth";
import { getSalonById, nextQueuePosition, pushNotification } from "@/lib/salon-data";
import { syncQueueNotifications } from "@/lib/queue-actions";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return withOwner(async (user) => {
    const { id } = await ctx.params;
    const bookingId = Number(id);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = str(body.action);

    const rows = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.salonId, user.salonId)))
      .limit(1);
    const booking = rows[0];
    if (!booking) return fail("That appointment no longer exists.", 404);

    const salon = await getSalonById(user.salonId);
    if (!salon) return fail("Salon not found", 404);

    switch (action) {
      case "confirm":
        await db.update(bookings).set({ status: "confirmed" }).where(eq(bookings.id, bookingId));
        break;
      case "arrive":
        await db.update(bookings).set({ status: "arrived" }).where(eq(bookings.id, bookingId));
        break;
      case "cancel": {
        await db.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, bookingId));
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
        await db
          .update(bookings)
          .set({ status: "confirmed", scheduledAt: next })
          .where(eq(bookings.id, bookingId));
        await pushNotification({
          salonId: user.salonId,
          customerId: booking.customerId,
          type: "booking",
          title: "Appointment Moved 📅",
          body: `New time: ${next.toLocaleDateString("en-US", {
            weekday: "long",
          })} at ${next.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}.\nRescheduled by ${salon.name}.`,
          url: `/s/${salon.slug}/b/${booking.token}`,
        });
        break;
      }
      case "add_to_queue": {
        const already = await db
          .select({ id: queueEntries.id })
          .from(queueEntries)
          .where(
            and(
              eq(queueEntries.salonId, user.salonId),
              eq(queueEntries.customerId, booking.customerId),
              inArray(queueEntries.status, ["waiting", "serving"]),
            ),
          )
          .limit(1);
        if (already.length > 0) return fail("This customer is already in the live queue.", 409);
        const position = await nextQueuePosition(user.salonId);
        await db.insert(queueEntries).values({
          salonId: user.salonId,
          customerId: booking.customerId,
          serviceId: booking.serviceId,
          staffId: booking.staffId,
          token: newToken(10),
          durationMin: booking.durationMin,
          source: "booking",
          position,
        });
        await db.update(bookings).set({ status: "arrived" }).where(eq(bookings.id, bookingId));
        await syncQueueNotifications(user.salonId, salon.name, salon.slug);
        break;
      }
      case "complete": {
        const svc = await db
          .select({ price: services.price })
          .from(services)
          .where(eq(services.id, booking.serviceId))
          .limit(1);
        const amount = svc[0]?.price ?? 0;
        const now = new Date();
        await db.update(bookings).set({ status: "completed" }).where(eq(bookings.id, bookingId));
        await db.insert(visits).values({
          salonId: user.salonId,
          customerId: booking.customerId,
          serviceId: booking.serviceId,
          staffId: booking.staffId,
          source: "booking",
          amount,
          durationMin: booking.durationMin,
          waitMin: 0,
          completedAt: now,
        });
        await db
          .update(customers)
          .set({
            totalVisits: sql`${customers.totalVisits} + 1`,
            totalSpend: sql`${customers.totalSpend} + ${amount}`,
            loyaltyPoints: sql`${customers.loyaltyPoints} + ${Math.max(1, Math.round(amount / 50))}`,
            lastVisitAt: now,
            lastActivityAt: now,
            lastServiceId: booking.serviceId,
          })
          .where(eq(customers.id, booking.customerId));
        break;
      }
      case "update": {
        const patch: Record<string, unknown> = {};
        if ("staffId" in body) patch.staffId = num(body.staffId);
        if ("notes" in body) patch.notes = str(body.notes) || null;
        if (Object.keys(patch).length === 0) return fail("Nothing to update.");
        await db.update(bookings).set(patch).where(eq(bookings.id, bookingId));
        break;
      }
      default:
        return fail("Unknown action.");
    }

    return ok({ ok: true });
  });
}
