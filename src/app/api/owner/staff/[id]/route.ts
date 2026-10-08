import { requestJson } from "@/lib/api-helpers";
import { staffRepository, staffServiceRepository, queueRepository } from "@/lib/firestore/repositories";
import { and, eq, inArray } from "@/lib/firestore/query";

import { queueEntries, staff, staffServices } from "@/lib/firestore/fields";
import { bool, fail, ok, str, withOwner } from "@/lib/api-helpers";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return withOwner(async (user) => {
    const { id } = await ctx.params;
    const staffId = Number(id);
    const body = (await requestJson(request).catch(() => ({}))) as Record<string, unknown>;

    const patch: Record<string, unknown> = {};
    if ("name" in body) {
      const name = str(body.name);
      if (!name) return fail("Name can't be empty.");
      patch.name = name;
    }
    if ("role" in body) patch.role = str(body.role) || "Barber";
    if ("bio" in body) patch.bio = str(body.bio) || null;
    if ("photoUrl" in body) patch.photoUrl = str(body.photoUrl) || null;
    if ("active" in body) patch.active = bool(body.active, true);
    if ("onShift" in body) patch.onShift = bool(body.onShift, true);
    if ("shiftStart" in body) patch.shiftStart = str(body.shiftStart) || "10:00";
    if ("shiftEnd" in body) patch.shiftEnd = str(body.shiftEnd) || "21:00";

    if (Object.keys(patch).length > 0) {
      const [updated] = await staffRepository.update(user.salonId, and(eq(staff.id, staffId), eq(staff.salonId, user.salonId)), patch);
      if (!updated) return fail("That team member no longer exists.", 404);
    }

    if (Array.isArray(body.serviceIds)) {
      const serviceIds = (body.serviceIds as unknown[]).map(Number).filter(Boolean);
      await staffServiceRepository.remove(user.salonId, and(eq(staffServices.salonId, user.salonId), eq(staffServices.staffId, staffId)));
      if (serviceIds.length > 0) {
        await staffServiceRepository.create(user.salonId, serviceIds.map((serviceId) => ({ salonId: user.salonId, staffId, serviceId })));
      }
    }

    return ok({ ok: true });
  }, request);
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return withOwner(async (user) => {
    const { id } = await ctx.params;
    const staffId = Number(id);
    const active = await queueRepository.find(user.salonId, { select: { id: queueEntries.id }, where: and(eq(queueEntries.staffId, staffId), inArray(queueEntries.status, ["waiting", "serving"])), limit: 1 });
    if (active.length > 0) {
      return fail("They still have customers in the live queue. Reassign those first.", 409);
    }
    await staffServiceRepository.remove(user.salonId, eq(staffServices.staffId, staffId));
    await staffRepository.remove(user.salonId, and(eq(staff.id, staffId), eq(staff.salonId, user.salonId)));
    return ok({ ok: true });
  }, _request);
}
