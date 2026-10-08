import { requestJson } from "@/lib/api-helpers";
import { queueRepository, serviceRepository } from "@/lib/firestore/repositories";
import { and, eq, inArray } from "@/lib/firestore/query";

import { queueEntries, services } from "@/lib/firestore/fields";
import { fail, num, ok, str, withOwner } from "@/lib/api-helpers";
import { getSalonById, pushNotification } from "@/lib/salon-data";
import { recordCompletion, resequence, syncQueueNotifications } from "@/lib/queue-actions";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return withOwner(async (user) => {
    const { id } = await ctx.params;
    const entryId = Number(id);
    const body = (await requestJson(request).catch(() => ({}))) as Record<string, unknown>;
    const action = str(body.action);

    const rows = await queueRepository.find(user.salonId, { where: and(eq(queueEntries.id, entryId), eq(queueEntries.salonId, user.salonId)), limit: 1 });
    const entry = rows[0];
    if (!entry) return fail("That queue entry no longer exists.", 404);

    const salon = await getSalonById(user.salonId);
    if (!salon) return fail("Salon not found", 404);

    switch (action) {
      case "start": {
        if (entry.status === "serving") return fail("That service has already started.");
        const chair = str(body.chair) || null;
        const staffId = num(body.staffId) ?? entry.staffId;
        await queueRepository.update(user.salonId, eq(queueEntries.id, entryId), { status: "serving", startedAt: new Date(), chair, staffId });
        break;
      }
      case "complete": {
        if (entry.status === "completed") return ok({ ok: true });
        if (!["waiting", "serving"].includes(entry.status)) return fail("That queue entry has already ended.", 409);
        if (entry.status !== "serving") {
          await queueRepository.update(user.salonId, eq(queueEntries.id, entryId), { status: "serving", startedAt: entry.startedAt ?? new Date() });
        }
        await recordCompletion(user.salonId, entryId);
        await resequence(user.salonId);
        break;
      }
      case "no_show":
      case "skip": {
        await queueRepository.update(user.salonId, eq(queueEntries.id, entryId), { status: action === "no_show" ? "no_show" : "skipped", completedAt: new Date() });
        await resequence(user.salonId);
        break;
      }
      case "cancel": {
        await queueRepository.update(user.salonId, eq(queueEntries.id, entryId), { status: "cancelled", completedAt: new Date() });
        await resequence(user.salonId);
        break;
      }
      case "move": {
        const dir = str(body.direction) === "up" ? -1 : 1;
        const siblings = await queueRepository.find(user.salonId, { select: { id: queueEntries.id, position: queueEntries.position }, where: and(
              eq(queueEntries.salonId, user.salonId),
              inArray(queueEntries.status, ["waiting"]),
            ), orderBy: [queueEntries.position, queueEntries.id] });
        const index = siblings.findIndex((s) => s.id === entryId);
        const target = siblings[index + dir];
        if (index === -1 || !target) return fail("They're already at the end of the line.");
        const current = siblings[index];
        await queueRepository.update(user.salonId, eq(queueEntries.id, current.id), { position: target.position });
        await queueRepository.update(user.salonId, eq(queueEntries.id, target.id), { position: current.position });
        break;
      }
      case "update": {
        const patch: Record<string, unknown> = {};
        const serviceId = num(body.serviceId);
        if (serviceId && serviceId !== entry.serviceId) {
          const svc = await serviceRepository.find(user.salonId, { where: and(eq(services.id, serviceId), eq(services.salonId, user.salonId)), limit: 1 });
          if (!svc[0]) return fail("That service isn't available.");
          patch.serviceId = serviceId;
          patch.durationMin = svc[0].durationMin;
        }
        if ("staffId" in body) patch.staffId = num(body.staffId);
        if ("notes" in body) patch.notes = str(body.notes) || null;
        if ("chair" in body) patch.chair = str(body.chair) || null;
        if (Object.keys(patch).length === 0) return fail("Nothing to update.");
        await queueRepository.update(user.salonId, eq(queueEntries.id, entryId), patch);
        break;
      }
      case "notify": {
        await pushNotification({
          salonId: user.salonId,
          customerId: entry.customerId,
          type: "queue",
          title: "Your Chair Is Ready 🔔",
          body: `Please come to ${salon.name} now.\nYour barber is waiting for you.`,
          url: `/s/${salon.slug}/q/${entry.token}`,
        });
        break;
      }
      default:
        return fail("Unknown action.");
    }

    await syncQueueNotifications(user.salonId, salon.name, salon.slug);
    return ok({ ok: true });
  }, request);
}
