import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { queueEntries, services } from "@/db/schema";
import { fail, num, ok, str, withOwner } from "@/lib/api-helpers";
import { getSalonById, pushNotification } from "@/lib/salon-data";
import { recordCompletion, resequence, syncQueueNotifications } from "@/lib/queue-actions";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return withOwner(async (user) => {
    const { id } = await ctx.params;
    const entryId = Number(id);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = str(body.action);

    const rows = await db
      .select()
      .from(queueEntries)
      .where(and(eq(queueEntries.id, entryId), eq(queueEntries.salonId, user.salonId)))
      .limit(1);
    const entry = rows[0];
    if (!entry) return fail("That queue entry no longer exists.", 404);

    const salon = await getSalonById(user.salonId);
    if (!salon) return fail("Salon not found", 404);

    switch (action) {
      case "start": {
        if (entry.status === "serving") return fail("That service has already started.");
        const chair = str(body.chair) || null;
        const staffId = num(body.staffId) ?? entry.staffId;
        await db
          .update(queueEntries)
          .set({ status: "serving", startedAt: new Date(), chair, staffId })
          .where(eq(queueEntries.id, entryId));
        break;
      }
      case "complete": {
        if (entry.status !== "serving") {
          await db
            .update(queueEntries)
            .set({ status: "serving", startedAt: entry.startedAt ?? new Date() })
            .where(eq(queueEntries.id, entryId));
        }
        await recordCompletion(entryId);
        await resequence(user.salonId);
        break;
      }
      case "skip": {
        await db
          .update(queueEntries)
          .set({ status: "skipped", completedAt: new Date() })
          .where(eq(queueEntries.id, entryId));
        await resequence(user.salonId);
        break;
      }
      case "cancel": {
        await db
          .update(queueEntries)
          .set({ status: "cancelled", completedAt: new Date() })
          .where(eq(queueEntries.id, entryId));
        await resequence(user.salonId);
        break;
      }
      case "move": {
        const dir = str(body.direction) === "up" ? -1 : 1;
        const siblings = await db
          .select({ id: queueEntries.id, position: queueEntries.position })
          .from(queueEntries)
          .where(
            and(
              eq(queueEntries.salonId, user.salonId),
              inArray(queueEntries.status, ["waiting"]),
            ),
          )
          .orderBy(queueEntries.position, queueEntries.id);
        const index = siblings.findIndex((s) => s.id === entryId);
        const target = siblings[index + dir];
        if (index === -1 || !target) return fail("They're already at the end of the line.");
        const current = siblings[index];
        await db
          .update(queueEntries)
          .set({ position: target.position })
          .where(eq(queueEntries.id, current.id));
        await db
          .update(queueEntries)
          .set({ position: current.position })
          .where(eq(queueEntries.id, target.id));
        break;
      }
      case "update": {
        const patch: Record<string, unknown> = {};
        const serviceId = num(body.serviceId);
        if (serviceId && serviceId !== entry.serviceId) {
          const svc = await db
            .select()
            .from(services)
            .where(and(eq(services.id, serviceId), eq(services.salonId, user.salonId)))
            .limit(1);
          if (!svc[0]) return fail("That service isn't available.");
          patch.serviceId = serviceId;
          patch.durationMin = svc[0].durationMin;
        }
        if ("staffId" in body) patch.staffId = num(body.staffId);
        if ("notes" in body) patch.notes = str(body.notes) || null;
        if ("chair" in body) patch.chair = str(body.chair) || null;
        if (Object.keys(patch).length === 0) return fail("Nothing to update.");
        await db.update(queueEntries).set(patch).where(eq(queueEntries.id, entryId));
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
  });
}
