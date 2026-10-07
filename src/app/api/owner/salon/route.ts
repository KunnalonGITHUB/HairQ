import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { offers, salons, workingHours } from "@/db/schema";
import { bool, fail, num, ok, slugify, str, withOwner } from "@/lib/api-helpers";
import { uniqueSlug } from "@/lib/onboarding";

export async function GET() {
  return withOwner(async (user) => {
    const [salonRows, hours, offerRows] = await Promise.all([
      db.select().from(salons).where(eq(salons.id, user.salonId)).limit(1),
      db
        .select()
        .from(workingHours)
        .where(eq(workingHours.salonId, user.salonId))
        .orderBy(workingHours.dayOfWeek),
      db.select().from(offers).where(eq(offers.salonId, user.salonId)).orderBy(offers.id),
    ]);
    if (!salonRows[0]) return fail("Salon not found", 404);
    return ok({ salon: salonRows[0], hours, offers: offerRows, owner: user });
  });
}

export async function PATCH(request: Request) {
  return withOwner(async (user) => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const section = str(body.section);

    if (section === "hours") {
      const rows = Array.isArray(body.hours) ? (body.hours as Record<string, unknown>[]) : [];
      for (const row of rows) {
        const dayOfWeek = num(row.dayOfWeek);
        if (dayOfWeek === null) continue;
        await db
          .update(workingHours)
          .set({
            isClosed: bool(row.isClosed),
            openTime: str(row.openTime) || "10:00",
            closeTime: str(row.closeTime) || "21:00",
            breakStart: str(row.breakStart) || null,
            breakEnd: str(row.breakEnd) || null,
          })
          .where(
            and(eq(workingHours.salonId, user.salonId), eq(workingHours.dayOfWeek, dayOfWeek)),
          );
      }
      return ok({ ok: true });
    }

    if (section === "offer") {
      const action = str(body.action);
      if (action === "create") {
        const title = str(body.title);
        if (!title) return fail("Give the offer a title.");
        const [created] = await db
          .insert(offers)
          .values({
            salonId: user.salonId,
            title,
            description: str(body.description) || null,
            badge: str(body.badge) || null,
            expiresAt: str(body.expiresAt) ? new Date(str(body.expiresAt)) : null,
          })
          .returning();
        return ok({ offer: created }, 201);
      }
      const id = num(body.id);
      if (!id) return fail("Missing offer.");
      if (action === "delete") {
        await db.delete(offers).where(and(eq(offers.id, id), eq(offers.salonId, user.salonId)));
        return ok({ ok: true });
      }
      const patch: Record<string, unknown> = {};
      if ("title" in body) patch.title = str(body.title);
      if ("description" in body) patch.description = str(body.description) || null;
      if ("badge" in body) patch.badge = str(body.badge) || null;
      if ("active" in body) patch.active = bool(body.active, true);
      await db
        .update(offers)
        .set(patch)
        .where(and(eq(offers.id, id), eq(offers.salonId, user.salonId)));
      return ok({ ok: true });
    }

    // Profile / branding / queue + booking configuration
    const patch: Record<string, unknown> = {};
    const textFields = [
      "name",
      "tagline",
      "about",
      "logoUrl",
      "heroImageUrl",
      "phone",
      "whatsapp",
      "email",
      "address",
      "mapsUrl",
      "instagram",
      "pwaName",
      "pwaShortName",
      "pwaThemeColor",
      "customDomain",
      "brandColor",
      "brandInk",
    ] as const;
    for (const field of textFields) {
      if (field in body) patch[field] = str(body[field]) || null;
    }
    if (patch.name === null) return fail("Your salon needs a name.");
    if ("queueStatus" in body) {
      const s = str(body.queueStatus);
      if (!["open", "paused", "closed"].includes(s)) return fail("Unknown queue status.");
      patch.queueStatus = s;
    }
    if ("maxQueueSize" in body) patch.maxQueueSize = Math.max(1, num(body.maxQueueSize) ?? 20);
    if ("bookingHorizonDays" in body)
      patch.bookingHorizonDays = Math.max(1, Math.min(90, num(body.bookingHorizonDays) ?? 14));
    if ("slotIntervalMin" in body) patch.slotIntervalMin = Math.max(5, num(body.slotIntervalMin) ?? 15);
    if ("acceptingBookings" in body) patch.acceptingBookings = bool(body.acceptingBookings, true);
    if ("allowServiceChange" in body) patch.allowServiceChange = bool(body.allowServiceChange, true);
    if ("websiteEnabled" in body) patch.websiteEnabled = bool(body.websiteEnabled, true);

    if ("slug" in body) {
      const wanted = slugify(str(body.slug));
      if (!wanted) return fail("Your link needs at least a few letters.");
      const current = await db.select().from(salons).where(eq(salons.id, user.salonId)).limit(1);
      if (current[0] && current[0].slug !== wanted) {
        patch.slug = await uniqueSlug(wanted);
      }
    }

    if (Object.keys(patch).length === 0) return fail("Nothing to update.");
    const [updated] = await db
      .update(salons)
      .set(patch)
      .where(eq(salons.id, user.salonId))
      .returning();
    return ok({ salon: updated });
  });
}
