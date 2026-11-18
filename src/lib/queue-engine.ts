/**
 * HairQ queue engine.
 *
 * Estimates are derived from real service durations and the number of chairs
 * (active staff on shift) rather than a flat "people x 30 minutes" guess.
 * In-progress services are modelled by their *remaining* time, so estimates
 * shift earlier when a barber finishes early and later when they run over.
 */

export type EngineEntry = {
  id: number;
  status: string; // waiting | serving
  position: number;
  durationMin: number;
  staffId: number | null;
  startedAt: Date | string | null;
};

export type EngineChair = {
  staffId: number;
  name: string;
};

/** An upcoming appointment that holds a barber's chair for a window of time. */
export type EngineReservation = {
  staffId: number;
  start: Date | string;
  durationMin: number;
};

export type Projection = {
  id: number;
  /** 1-based position among waiting customers */
  position: number;
  ahead: number;
  startAt: Date;
  endAt: Date;
  waitMin: number;
  chairStaffId: number | null;
};

export type QueueProjection = {
  byEntry: Map<number, Projection>;
  waitingCount: number;
  servingCount: number;
  /** Minutes until a brand-new joiner of `durationMin` would start */
  nextOpeningInMin: number;
  nextOpeningAt: Date;
  workloadMin: number;
};

function asDate(value: Date | string | null): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

export function projectQueue(
  entries: EngineEntry[],
  chairs: EngineChair[],
  now: Date = new Date(),
  reservations: EngineReservation[] = [],
  /** Service length assumed for a brand-new joiner when fitting around appointments. */
  newcomerDurationMin = 30,
): QueueProjection {
  const chairState = (chairs.length > 0 ? chairs : [{ staffId: -1, name: "Chair 1" }]).map((c) => ({
    staffId: c.staffId,
    freeAt: now.getTime(),
    // Appointments still ahead of us, for this barber's chair, in time order.
    held: reservations
      .filter((r) => r.staffId === c.staffId)
      .map((r) => {
        const start = (asDate(r.start) ?? now).getTime();
        return { start, end: start + r.durationMin * 60000 };
      })
      .filter((r) => r.end > now.getTime())
      .sort((a, b) => a.start - b.start),
  }));

  /** First moment from `from` when this chair has `durationMin` free of appointments. */
  const fitStart = (chair: (typeof chairState)[number], from: number, durationMin: number) => {
    let start = Math.max(from, now.getTime());
    for (const slot of chair.held) {
      if (start < slot.end && slot.start < start + durationMin * 60000) start = slot.end;
    }
    return start;
  };

  const serving = entries.filter((e) => e.status === "serving");
  const waiting = entries
    .filter((e) => e.status === "waiting")
    .sort((a, b) => a.position - b.position || a.id - b.id);

  // 1. Occupy chairs with in-progress services (remaining time only).
  for (const entry of serving) {
    const started = asDate(entry.startedAt) ?? now;
    const elapsed = (now.getTime() - started.getTime()) / 60000;
    const remaining = Math.max(1, entry.durationMin - elapsed);
    const freeAt = now.getTime() + remaining * 60000;
    const owned = chairState.find((c) => c.staffId === entry.staffId);
    const target = owned ?? chairState.reduce((a, b) => (a.freeAt <= b.freeAt ? a : b));
    target.freeAt = Math.max(target.freeAt, freeAt);
  }

  // 2. Walk the waiting line, assigning each person to the chair that frees up first.
  const byEntry = new Map<number, Projection>();
  let workloadMin = serving.reduce((sum, e) => {
    const started = asDate(e.startedAt) ?? now;
    const elapsed = (now.getTime() - started.getTime()) / 60000;
    return sum + Math.max(1, e.durationMin - elapsed);
  }, 0);

  waiting.forEach((entry, index) => {
    const preferred = entry.staffId
      ? chairState.find((c) => c.staffId === entry.staffId)
      : undefined;
    // Without appointments this is the chair that frees first, exactly as before.
    let chair = preferred ?? chairState[0];
    let start = fitStart(chair, chair.freeAt, entry.durationMin);
    if (!preferred) {
      for (const candidate of chairState) {
        const candidateStart = fitStart(candidate, candidate.freeAt, entry.durationMin);
        if (candidateStart < start) {
          chair = candidate;
          start = candidateStart;
        }
      }
    }
    const startAt = new Date(start);
    const endAt = new Date(startAt.getTime() + entry.durationMin * 60000);
    chair.freeAt = endAt.getTime();
    workloadMin += entry.durationMin;
    byEntry.set(entry.id, {
      id: entry.id,
      position: index + 1,
      ahead: index,
      startAt,
      endAt,
      waitMin: Math.max(0, Math.round((startAt.getTime() - now.getTime()) / 60000)),
      chairStaffId: chair.staffId === -1 ? null : chair.staffId,
    });
  });

  const nextOpeningAt = new Date(
    Math.min(...chairState.map((c) => fitStart(c, c.freeAt, newcomerDurationMin))),
  );

  return {
    byEntry,
    waitingCount: waiting.length,
    servingCount: serving.length,
    nextOpeningAt,
    nextOpeningInMin: Math.max(0, Math.round((nextOpeningAt.getTime() - now.getTime()) / 60000)),
    workloadMin: Math.round(workloadMin),
  };
}

/** Stage used to decide which push notification a waiting customer should get. */
export function queueStage(ahead: number, status: string): "serving" | "next" | "soon" | "waiting" {
  if (status === "serving") return "serving";
  if (ahead === 0) return "next";
  if (ahead <= 2) return "soon";
  return "waiting";
}

/**
 * Notification copy for each queue stage.
 *
 * Presentation only — a strong titled headline plus one or two short support
 * lines (separated by \n) so the notification card renders a clean hierarchy.
 */
export function stageCopy(stage: string, salonName: string, ahead: number, waitMin?: number) {
  const wait =
    typeof waitMin === "number" && waitMin > 0
      ? `Approx wait: ${waitMin < 60 ? `${waitMin} mins` : `${Math.floor(waitMin / 60)} hr ${waitMin % 60} mins`}.`
      : null;

  switch (stage) {
    case "serving":
      return {
        title: "You're In The Chair ✂️",
        body: `Your service has started at ${salonName}.\nEnjoy — we'll see you at the counter.`,
      };
    case "next":
      return {
        title: "You're Next 🔔",
        body: "Please head to the salon now.\nYour turn is coming up.",
      };
    case "soon":
      return {
        title: "Almost Your Turn ✂️",
        body: `${ahead} customer${ahead === 1 ? "" : "s"} ahead of you.${wait ? `\n${wait}` : "\nPlease start heading over."}`,
      };
    default:
      return {
        title: "Queue Update 👥",
        body: `${ahead} customer${ahead === 1 ? "" : "s"} ahead of you.${wait ? `\n${wait}` : ""}`,
      };
  }
}
