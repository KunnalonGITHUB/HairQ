import { requestJson } from "@/lib/api-helpers";
import { staffRepository, serviceRepository, staffServiceRepository, queueRepository } from "@/lib/firestore/repositories";
import { and, eq, inArray } from "@/lib/firestore/query";

import { queueEntries, services, staff, staffServices } from "@/lib/firestore/fields";
import { bool, fail, ok, str, withOwner } from "@/lib/api-helpers";

export async function GET(request: Request) {
  return withOwner(async (user) => {
    const [team, svc, links, busy] = await Promise.all([
      staffRepository.find(user.salonId, { where: eq(staff.salonId, user.salonId), orderBy: [staff.id] }),
      serviceRepository.find(user.salonId, { select: { id: services.id, name: services.name, durationMin: services.durationMin }, where: eq(services.salonId, user.salonId), orderBy: [services.sortOrder] }),
      staffServiceRepository.find(user.salonId, { where: eq(staffServices.salonId, user.salonId) }),
      queueRepository.find(user.salonId, { select: { staffId: queueEntries.staffId, status: queueEntries.status }, where: and(eq(queueEntries.salonId, user.salonId), inArray(queueEntries.status, ["waiting", "serving"])) }),
    ]);

    return ok({
      staff: team.map((s) => ({
        ...s,
        serviceIds: links.filter((l) => l.staffId === s.id).map((l) => l.serviceId),
        serving: busy.some((b) => b.staffId === s.id && b.status === "serving"),
        waitingFor: busy.filter((b) => b.staffId === s.id && b.status === "waiting").length,
      })),
      services: svc,
    });
  }, request);
}

export async function POST(request: Request) {
  return withOwner(async (user) => {
    const body = (await requestJson(request).catch(() => ({}))) as Record<string, unknown>;
    const name = str(body.name);
    if (!name) return fail("Add the team member's name.");

    const [created] = await staffRepository.create(user.salonId, {
        salonId: user.salonId,
        name,
        role: str(body.role) || "Barber",
        bio: str(body.bio) || null,
        photoUrl: str(body.photoUrl) || null,
        active: bool(body.active, true),
        onShift: bool(body.onShift, true),
        shiftStart: str(body.shiftStart) || "10:00",
        shiftEnd: str(body.shiftEnd) || "21:00",
      });

    const serviceIds = Array.isArray(body.serviceIds)
      ? (body.serviceIds as unknown[]).map(Number).filter(Boolean)
      : [];
    if (serviceIds.length > 0) {
      await staffServiceRepository.create(user.salonId, serviceIds.map((serviceId) => ({ salonId: user.salonId, staffId: created.id, serviceId })));
    }
    return ok({ staff: created }, 201);
  }, request);
}
