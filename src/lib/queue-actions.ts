import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, queueEntries, services, visits } from "@/db/schema";
import { loadLiveQueue, pushNotification } from "./salon-data";
import { queueStage, stageCopy } from "./queue-engine";

/**
 * Re-evaluates every waiting customer's "closeness" to their turn and fires a
 * transactional push only when their stage actually changed. This is what makes
 * "You're next" arrive exactly once rather than on every poll.
 */
export async function syncQueueNotifications(salonId: number, salonName: string, slug: string) {
  const { entries } = await loadLiveQueue(salonId);
  for (const entry of entries) {
    const stage = queueStage(entry.ahead, entry.status);
    const current = await db
      .select({ notifiedStage: queueEntries.notifiedStage })
      .from(queueEntries)
      .where(eq(queueEntries.id, entry.id))
      .limit(1);
    if ((current[0]?.notifiedStage ?? null) === stage) continue;
    if (stage !== "waiting") {
      const copy = stageCopy(stage, salonName, entry.ahead, entry.waitMin);
      await pushNotification({
        salonId,
        customerId: entry.customerId,
        type: "queue",
        title: copy.title,
        body: copy.body,
        url: `/s/${slug}/q/${entry.token}`,
        respectOptIn: true,
      });
    }
    await db
      .update(queueEntries)
      .set({ notifiedStage: stage })
      .where(eq(queueEntries.id, entry.id));
  }
}

export async function recordCompletion(entryId: number) {
  const rows = await db
    .select({
      entry: queueEntries,
      price: services.price,
      serviceId: services.id,
    })
    .from(queueEntries)
    .innerJoin(services, eq(services.id, queueEntries.serviceId))
    .where(eq(queueEntries.id, entryId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const { entry, price } = row;
  const now = new Date();
  const waitMin = Math.max(
    0,
    Math.round(((entry.startedAt ?? now).getTime() - entry.joinedAt.getTime()) / 60000),
  );
  const durationMin = entry.startedAt
    ? Math.max(1, Math.round((now.getTime() - entry.startedAt.getTime()) / 60000))
    : entry.durationMin;

  await db.insert(visits).values({
    salonId: entry.salonId,
    customerId: entry.customerId,
    serviceId: entry.serviceId,
    staffId: entry.staffId,
    source: entry.source === "walk_in" ? "walk_in" : "queue",
    amount: price,
    durationMin,
    waitMin,
    completedAt: now,
  });

  await db
    .update(customers)
    .set({
      totalVisits: sql`${customers.totalVisits} + 1`,
      totalSpend: sql`${customers.totalSpend} + ${price}`,
      loyaltyPoints: sql`${customers.loyaltyPoints} + ${Math.max(1, Math.round(price / 50))}`,
      lastVisitAt: now,
      lastActivityAt: now,
      lastServiceId: entry.serviceId,
      preferredStaffId: entry.staffId ?? undefined,
    })
    .where(eq(customers.id, entry.customerId));

  await db
    .update(queueEntries)
    .set({ status: "completed", completedAt: now })
    .where(eq(queueEntries.id, entryId));

  return { entry, durationMin, waitMin, amount: price };
}

/** Keeps positions dense (1..n) after removals so "move up/down" stays sane. */
export async function resequence(salonId: number) {
  const rows = await db
    .select({ id: queueEntries.id })
    .from(queueEntries)
    .where(
      and(eq(queueEntries.salonId, salonId), inArray(queueEntries.status, ["waiting", "serving"])),
    )
    .orderBy(queueEntries.position, queueEntries.id);
  let i = 1;
  for (const row of rows) {
    await db.update(queueEntries).set({ position: i }).where(eq(queueEntries.id, row.id));
    i += 1;
  }
}
