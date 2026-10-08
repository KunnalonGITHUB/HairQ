import { requestJson } from "@/lib/api-helpers";
import { serviceRepository, staffRepository, staffServiceRepository } from "@/lib/firestore/repositories";
import { and, eq } from "@/lib/firestore/query";

import { services, staff, staffServices } from "@/lib/firestore/fields";
import { bool, fail, num, ok, str, withOwner } from "@/lib/api-helpers";

export async function GET(request: Request) {
  return withOwner(async (user) => {
    const [svc, team, links] = await Promise.all([
      serviceRepository.find(user.salonId, { where: eq(services.salonId, user.salonId), orderBy: [services.sortOrder, services.id] }),
      staffRepository.find(user.salonId, { where: eq(staff.salonId, user.salonId), orderBy: [staff.id] }),
      staffServiceRepository.find(user.salonId, { where: eq(staffServices.salonId, user.salonId) }),
    ]);
    return ok({
      services: svc.map((s) => ({
        ...s,
        staffIds: links.filter((l) => l.serviceId === s.id).map((l) => l.staffId),
      })),
      staff: team,
    });
  }, request);
}

export async function POST(request: Request) {
  return withOwner(async (user) => {
    const body = (await requestJson(request).catch(() => ({}))) as Record<string, unknown>;
    const name = str(body.name);
    const durationMin = num(body.durationMin) ?? 30;
    const price = num(body.price) ?? 0;
    if (!name) return fail("Give the service a name.");
    if (durationMin < 5 || durationMin > 480) return fail("Duration should be between 5 and 480 minutes.");

    const count = await serviceRepository.find(user.salonId, { select: { id: services.id }, where: eq(services.salonId, user.salonId) });

    const [created] = await serviceRepository.create(user.salonId, {
        salonId: user.salonId,
        name,
        description: str(body.description) || null,
        category: str(body.category) || "Hair",
        price: Math.max(0, price),
        durationMin,
        active: bool(body.active, true),
        sortOrder: count.length,
      });

    const staffIds = Array.isArray(body.staffIds) ? (body.staffIds as unknown[]).map(Number) : [];
    if (staffIds.length > 0) {
      await staffServiceRepository.create(user.salonId, staffIds.map((staffId) => ({ salonId: user.salonId, staffId, serviceId: created.id })));
    }
    return ok({ service: created }, 201);
  }, request);
}
