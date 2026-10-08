import { requestJson } from "@/lib/api-helpers";
import { serviceRepository, staffServiceRepository, queueRepository, bookingRepository } from "@/lib/firestore/repositories";
import { and, eq } from "@/lib/firestore/query";

import { bookings, queueEntries, services, staffServices } from "@/lib/firestore/fields";
import { bool, fail, num, ok, str, withOwner } from "@/lib/api-helpers";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return withOwner(async (user) => {
    const { id } = await ctx.params;
    const serviceId = Number(id);
    const body = (await requestJson(request).catch(() => ({}))) as Record<string, unknown>;

    const patch: Record<string, unknown> = {};
    if ("name" in body) {
      const name = str(body.name);
      if (!name) return fail("Give the service a name.");
      patch.name = name;
    }
    if ("description" in body) patch.description = str(body.description) || null;
    if ("category" in body) patch.category = str(body.category) || "Hair";
    if ("price" in body) patch.price = Math.max(0, num(body.price) ?? 0);
    if ("durationMin" in body) {
      const d = num(body.durationMin) ?? 30;
      if (d < 5 || d > 480) return fail("Duration should be between 5 and 480 minutes.");
      patch.durationMin = d;
    }
    if ("active" in body) patch.active = bool(body.active, true);
    if ("sortOrder" in body) patch.sortOrder = num(body.sortOrder) ?? 0;

    if (Object.keys(patch).length > 0) {
      const [updated] = await serviceRepository.update(user.salonId, and(eq(services.id, serviceId), eq(services.salonId, user.salonId)), patch);
      if (!updated) return fail("That service no longer exists.", 404);
    }

    if (Array.isArray(body.staffIds)) {
      const staffIds = (body.staffIds as unknown[]).map(Number).filter(Boolean);
      await staffServiceRepository.remove(user.salonId, and(eq(staffServices.salonId, user.salonId), eq(staffServices.serviceId, serviceId)));
      if (staffIds.length > 0) {
        await staffServiceRepository.create(user.salonId, staffIds.map((staffId) => ({ salonId: user.salonId, staffId, serviceId })));
      }
    }

    return ok({ ok: true });
  }, request);
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return withOwner(async (user) => {
    const { id } = await ctx.params;
    const serviceId = Number(id);

    const [inQueue, booked] = await Promise.all([
      queueRepository.find(user.salonId, { select: { id: queueEntries.id }, where: eq(queueEntries.serviceId, serviceId), limit: 1 }),
      bookingRepository.find(user.salonId, { select: { id: bookings.id }, where: eq(bookings.serviceId, serviceId), limit: 1 }),
    ]);
    if (inQueue.length > 0 || booked.length > 0) {
      await serviceRepository.update(user.salonId, and(eq(services.id, serviceId), eq(services.salonId, user.salonId)), { active: false });
      return ok({ ok: true, archived: true });
    }

    await staffServiceRepository.remove(user.salonId, eq(staffServices.serviceId, serviceId));
    await serviceRepository.remove(user.salonId, and(eq(services.id, serviceId), eq(services.salonId, user.salonId)));
    return ok({ ok: true });
  }, _request);
}
