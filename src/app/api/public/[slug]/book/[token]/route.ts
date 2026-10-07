import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, customers, services, staff } from "@/db/schema";
import { fail, guarded, ok } from "@/lib/api-helpers";
import { getSalonBySlug } from "@/lib/salon-data";

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string; token: string }> }) {
  return guarded(async () => {
    const { slug, token } = await ctx.params;
    const salon = await getSalonBySlug(slug);
    if (!salon) return fail("We couldn't find that salon link.", 404);

    const rows = await db
      .select({
        id: bookings.id,
        token: bookings.token,
        scheduledAt: bookings.scheduledAt,
        durationMin: bookings.durationMin,
        status: bookings.status,
        notes: bookings.notes,
        serviceName: services.name,
        servicePrice: services.price,
        customerName: customers.name,
        customerId: customers.id,
        customerPhone: customers.phone,
        staffId: bookings.staffId,
      })
      .from(bookings)
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .where(and(eq(bookings.salonId, salon.id), eq(bookings.token, token)))
      .limit(1);

    const booking = rows[0];
    if (!booking) return fail("We couldn't find that appointment.", 404);

    let staffName: string | null = null;
    if (booking.staffId) {
      const s = await db.select({ name: staff.name }).from(staff).where(eq(staff.id, booking.staffId)).limit(1);
      staffName = s[0]?.name ?? null;
    }

    return ok({
      booking: { ...booking, staffName },
      salon: {
        name: salon.name,
        slug: salon.slug,
        phone: salon.phone,
        whatsapp: salon.whatsapp,
        address: salon.address,
        mapsUrl: salon.mapsUrl,
        brandColor: salon.brandColor,
        logoUrl: salon.logoUrl,
      },
    });
  });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ slug: string; token: string }> }) {
  return guarded(async () => {
    const { slug, token } = await ctx.params;
    const salon = await getSalonBySlug(slug);
    if (!salon) return fail("We couldn't find that salon link.", 404);

    const rows = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.salonId, salon.id), eq(bookings.token, token)))
      .limit(1);
    const booking = rows[0];
    if (!booking) return fail("We couldn't find that appointment.", 404);
    if (booking.status === "completed") return fail("That appointment is already complete.");

    await db.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, booking.id));
    return ok({ ok: true });
  });
}
