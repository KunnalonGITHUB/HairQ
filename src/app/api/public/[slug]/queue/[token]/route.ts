import { requestJson } from "@/lib/api-helpers";
import { queueRepository, serviceRepository } from "@/lib/firestore/repositories";
import { and, eq } from "@/lib/firestore/query";

import { queueEntries, services } from "@/lib/firestore/fields";
import { fail, guarded, num, ok, str } from "@/lib/api-helpers";
import { getSalonBySlug, loadLiveQueue } from "@/lib/salon-data";
import { queueStage } from "@/lib/queue-engine";
import { resequence, syncQueueNotifications } from "@/lib/queue-actions";
import { clockLabel, humanDuration, waitBand } from "@/lib/time";

type EntryState =
  | { kind: "error"; message: string; status: number }
  | { kind: "ok"; salon: NonNullable<Awaited<ReturnType<typeof getSalonBySlug>>>; row: import("@/lib/firestore/entities").QueueEntry };

async function entryState(slug: string, token: string): Promise<EntryState> {
  const salon = await getSalonBySlug(slug);
  if (!salon) return { kind: "error", message: "We couldn't find that salon link.", status: 404 };

  const rows = await queueRepository.find(salon.id, { where: and(eq(queueEntries.salonId, salon.id), eq(queueEntries.token, token)), limit: 1 });
  const row = rows[0];
  if (!row) return { kind: "error", message: "That queue ticket is no longer active.", status: 404 };
  return { kind: "ok", salon, row };
}

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string; token: string }> }) {
  return guarded(async () => {
    const { slug, token } = await ctx.params;
    const state = await entryState(slug, token);
    if (state.kind === "error") return fail(state.message, state.status);
    const { salon, row } = state;

    const live = await loadLiveQueue(salon.id);
    const entry = live.entries.find((e) => e.id === row.id);

    if (!entry) {
      const svc = await serviceRepository.find(salon.id, { select: { name: services.name }, where: eq(services.id, row.serviceId), limit: 1 });
      return ok({
        active: false,
        status: row.status,
        serviceName: svc[0]?.name ?? "Service",
        salon: { name: salon.name, slug: salon.slug, phone: salon.phone, mapsUrl: salon.mapsUrl },
      });
    }

    const stage = queueStage(entry.ahead, entry.status);
    return ok({
      active: true,
      entry: {
        id: entry.id,
        token: entry.token,
        status: entry.status,
        position: entry.projPosition,
        ahead: entry.ahead,
        waitMin: entry.waitMin,
        waitLabel: entry.status === "serving" ? "In the chair" : waitBand(entry.waitMin),
        waitExact: humanDuration(entry.waitMin),
        turnLabel: clockLabel(new Date(entry.startAtISO)),
        serviceName: entry.serviceName,
        serviceId: entry.serviceId,
        durationMin: entry.durationMin,
        staffName: entry.staffName,
        customerName: entry.customerName,
        customerId: entry.customerId,
        joinedAt: entry.joinedAt,
        stage,
      },
      queue: {
        waiting: live.waiting.length,
        serving: live.serving.length,
        status: salon.queueStatus,
        chairCount: live.chairCount,
      },
      salon: {
        name: salon.name,
        slug: salon.slug,
        phone: salon.phone,
        whatsapp: salon.whatsapp,
        mapsUrl: salon.mapsUrl,
        address: salon.address,
        brandColor: salon.brandColor,
        logoUrl: salon.logoUrl,
        allowServiceChange: salon.allowServiceChange,
      },
      now: new Date().toISOString(),
    });
  });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ slug: string; token: string }> }) {
  return guarded(async () => {
    const { slug, token } = await ctx.params;
    const state = await entryState(slug, token);
    if (state.kind === "error") return fail(state.message, state.status);
    const { salon, row } = state;

    if (row.status !== "waiting") {
      return fail("Your service has already started — please speak to the front desk.", 409);
    }
    if (!salon.allowServiceChange) {
      return fail("This salon asks customers to change services at the counter.", 403);
    }

    const body = (await requestJson(request).catch(() => ({}))) as Record<string, unknown>;
    const serviceId = num(body.serviceId);
    if (!serviceId) return fail("Choose a service.");

    const svc = await serviceRepository.find(salon.id, { where: and(eq(services.id, serviceId), eq(services.salonId, salon.id), eq(services.active, true)), limit: 1 });
    if (!svc[0]) return fail("That service isn't available right now.");

    await queueRepository.update(salon.id, eq(queueEntries.id, row.id), { serviceId, durationMin: svc[0].durationMin, staffId: num(body.staffId) ?? row.staffId });

    await syncQueueNotifications(salon.id, salon.name, salon.slug);
    return ok({ ok: true });
  });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ slug: string; token: string }> }) {
  return guarded(async () => {
    const { slug, token } = await ctx.params;
    const state = await entryState(slug, token);
    if (state.kind === "error") return fail(state.message, state.status);
    const { salon, row } = state;

    if (row.status === "serving") {
      return fail("You're already in the chair — please talk to the salon.", 409);
    }
    await queueRepository.update(salon.id, eq(queueEntries.id, row.id), { status: "cancelled", completedAt: new Date() });
    await resequence(salon.id);
    await syncQueueNotifications(salon.id, salon.name, salon.slug);
    return ok({ ok: true });
  });
}
