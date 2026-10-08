import { requestJson } from "@/lib/api-helpers";
import { serviceRepository, staffRepository, visitRepository, queueRepository, salonRepository } from "@/lib/firestore/repositories";
import { and, eq, gte, inArray } from "@/lib/firestore/query";

import { queueEntries, salons, services, staff, visits } from "@/lib/firestore/fields";
import { bool, fail, num, ok, str, validPhone, withOwner } from "@/lib/api-helpers";
import { newToken } from "@/lib/auth";
import {
  getSalonById,
  loadLiveQueue,
  nextQueuePosition,
  upsertCustomer,
} from "@/lib/salon-data";
import { syncQueueNotifications } from "@/lib/queue-actions";
import { startOfDay } from "@/lib/time";

export async function GET(request: Request) {
  return withOwner(async (user) => {
    const salon = await getSalonById(user.salonId);
    if (!salon) return fail("Salon not found", 404);
    const [live, svc, team, todayVisits] = await Promise.all([
      loadLiveQueue(user.salonId),
      serviceRepository.find(user.salonId, { where: and(eq(services.salonId, user.salonId), eq(services.active, true)), orderBy: [services.sortOrder, services.id] }),
      staffRepository.find(user.salonId, { where: eq(staff.salonId, user.salonId), orderBy: [staff.id] }),
      visitRepository.find(user.salonId, { select: { waitMin: visits.waitMin, amount: visits.amount }, where: and(eq(visits.salonId, user.salonId), gte(visits.completedAt, startOfDay(new Date()))) }),
    ]);

    const avgWait = todayVisits.length
      ? Math.round(todayVisits.reduce((s, v) => s + v.waitMin, 0) / todayVisits.length)
      : 0;

    return ok({
      salon: {
        id: salon.id,
        name: salon.name,
        slug: salon.slug,
        queueStatus: salon.queueStatus,
        maxQueueSize: salon.maxQueueSize,
        currency: salon.currency,
      },
      serving: live.serving,
      waiting: live.waiting,
      chairs: live.chairs,
      chairCount: live.chairCount,
      workloadMin: live.projection.workloadMin,
      nextOpeningInMin: live.projection.nextOpeningInMin,
      services: svc,
      staff: team,
      stats: {
        servedToday: todayVisits.length,
        avgWait,
        revenueToday: todayVisits.reduce((s, v) => s + v.amount, 0),
      },
      now: new Date().toISOString(),
    });
  }, request);
}

export async function POST(request: Request) {
  return withOwner(async (user) => {
    const body = (await requestJson(request).catch(() => ({}))) as Record<string, unknown>;
    const name = str(body.name);
    const phone = str(body.phone);
    const serviceId = num(body.serviceId);
    const staffId = num(body.staffId);

    if (!name) return fail("Add the customer's name.");
    if (!validPhone(phone)) return fail("Add a valid phone number so they can track their turn.");
    if (!serviceId) return fail("Pick the service they're here for.");

    const salon = await getSalonById(user.salonId);
    if (!salon) return fail("Salon not found", 404);

    const svcRows = await serviceRepository.find(user.salonId, { where: and(eq(services.id, serviceId), eq(services.salonId, user.salonId)), limit: 1 });
    const service = svcRows[0];
    if (!service) return fail("That service isn't on your menu any more.");

    const customer = await upsertCustomer({
      salonId: user.salonId,
      name,
      phone,
      source: "walk_in",
      preferredStaffId: staffId,
      notes: str(body.notes) || null,
    });

    const already = await queueRepository.find(user.salonId, { select: { id: queueEntries.id }, where: and(
          eq(queueEntries.salonId, user.salonId),
          eq(queueEntries.customerId, customer.id),
          inArray(queueEntries.status, ["waiting", "serving"]),
        ), limit: 1 });
    if (already.length > 0) return fail(`${name} is already in today's queue.`, 409);

    const position = await nextQueuePosition(user.salonId);
    const [entry] = await queueRepository.create(user.salonId, {
        salonId: user.salonId,
        customerId: customer.id,
        serviceId: service.id,
        staffId: staffId ?? null,
        token: newToken(10),
        durationMin: service.durationMin,
        source: bool(body.online) ? "online" : "walk_in",
        notes: str(body.notes) || null,
        position,
      });

    await syncQueueNotifications(user.salonId, salon.name, salon.slug);
    return ok({ entry }, 201);
  }, request);
}

export async function PATCH(request: Request) {
  return withOwner(async (user) => {
    const body = (await requestJson(request).catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const status = str(body.queueStatus);
    if (status && ["open", "paused", "closed"].includes(status)) patch.queueStatus = status;
    const max = num(body.maxQueueSize);
    if (max !== null) patch.maxQueueSize = Math.max(1, Math.min(200, max));
    if (Object.keys(patch).length === 0) return fail("Nothing to update.");
    const [salon] = await salonRepository.update(user.salonId, eq(salons.id, user.salonId), patch);
    return ok({ salon });
  }, request);
}
