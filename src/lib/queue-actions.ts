import { mutate } from "./firestore/store";
import { queueRepository, completeVisit, type CompletionExtra } from "@/lib/firestore/repositories";
import { and, eq, inArray } from "@/lib/firestore/query";

import { queueEntries } from "@/lib/firestore/fields";
import { loadLiveQueue, pushNotification } from "./salon-data";
import { queueStage, stageCopy } from "./queue-engine";

/**
 * Re-evaluates every waiting customer's "closeness" to their turn and fires a
 * transactional push only when their stage actually changed. This is what makes
 * "You're next" arrive exactly once rather than on every poll.
 */
export async function syncQueueNotifications(salonId: number, salonName: string, slug: string) {
  return mutate(salonId, async () => {
  const { entries } = await loadLiveQueue(salonId);
  for (const entry of entries) {
    const stage = queueStage(entry.ahead, entry.status);
    const current = await queueRepository.find(salonId, { select: { notifiedStage: queueEntries.notifiedStage }, where: eq(queueEntries.id, entry.id), limit: 1 });
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
    await queueRepository.update(salonId, eq(queueEntries.id, entry.id), { notifiedStage: stage });
  }
  });
}

export async function recordCompletion(salonId: number, entryId: number, extras: CompletionExtra[] = []) {
  return completeVisit(salonId, "queueEntries", entryId, extras);
}

/** Keeps positions dense (1..n) after removals so "move up/down" stays sane. */
export async function resequence(salonId: number) {
  return mutate(salonId, async () => {
  const rows = await queueRepository.find(salonId, { select: { id: queueEntries.id }, where: and(eq(queueEntries.salonId, salonId), inArray(queueEntries.status, ["waiting", "serving"])), orderBy: [queueEntries.position, queueEntries.id] });
  let i = 1;
  for (const row of rows) {
    await queueRepository.update(salonId, eq(queueEntries.id, row.id), { position: i });
    i += 1;
  }
  });
}
