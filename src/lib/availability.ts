import { toMinutes } from "./time";

export type HoursRow = {
  dayOfWeek: number;
  isClosed: boolean;
  openTime: string;
  closeTime: string;
  breakStart: string | null;
  breakEnd: string | null;
};

export type StaffRow = {
  id: number;
  name: string;
  active: boolean;
  shiftStart: string;
  shiftEnd: string;
};

export type BookingRow = {
  id: number;
  staffId: number | null;
  scheduledAt: Date | string;
  durationMin: number;
  status: string;
};

export type Slot = {
  time: string; // ISO
  label: string;
  staffIds: number[];
};

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

export function buildSlots(params: {
  day: Date;
  hours: HoursRow | undefined;
  durationMin: number;
  slotIntervalMin: number;
  staff: StaffRow[];
  staffServiceMap: Map<number, Set<number>>;
  serviceId: number;
  bookings: BookingRow[];
  preferredStaffId: number | null;
  now: Date;
  leadMin?: number;
}): Slot[] {
  const {
    day,
    hours,
    durationMin,
    slotIntervalMin,
    staff,
    staffServiceMap,
    serviceId,
    bookings,
    preferredStaffId,
    now,
    leadMin = 15,
  } = params;

  if (!hours || hours.isClosed) return [];

  const open = toMinutes(hours.openTime) ?? 600;
  const close = toMinutes(hours.closeTime) ?? 1260;
  const breakStart = toMinutes(hours.breakStart);
  const breakEnd = toMinutes(hours.breakEnd);

  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);

  const eligibleStaff = staff.filter((s) => {
    if (!s.active) return false;
    if (preferredStaffId && s.id !== preferredStaffId) return false;
    const allowed = staffServiceMap.get(s.id);
    // A barber with no explicit mapping is treated as able to do everything.
    if (allowed && allowed.size > 0 && !allowed.has(serviceId)) return false;
    return true;
  });

  if (eligibleStaff.length === 0) return [];

  const dayBookings = bookings
    .filter((b) => b.status !== "cancelled" && b.status !== "no_show")
    .map((b) => {
      const at = b.scheduledAt instanceof Date ? b.scheduledAt : new Date(b.scheduledAt);
      const start = (at.getTime() - dayStart.getTime()) / 60000;
      return { staffId: b.staffId, start, end: start + b.durationMin };
    })
    .filter((b) => b.end > 0 && b.start < 1440);

  const minStart = (now.getTime() + leadMin * 60000 - dayStart.getTime()) / 60000;
  const slots: Slot[] = [];

  for (let start = open; start + durationMin <= close; start += slotIntervalMin) {
    const end = start + durationMin;
    if (start < minStart) continue;
    if (breakStart !== null && breakEnd !== null && overlaps(start, end, breakStart, breakEnd)) {
      continue;
    }

    const freeStaff = eligibleStaff.filter((s) => {
      const shiftStart = toMinutes(s.shiftStart) ?? open;
      const shiftEnd = toMinutes(s.shiftEnd) ?? close;
      if (start < shiftStart || end > shiftEnd) return false;
      return !dayBookings.some(
        (b) => (b.staffId === null || b.staffId === s.id) && overlaps(start, end, b.start, b.end),
      );
    });

    if (freeStaff.length === 0) continue;

    const at = new Date(dayStart.getTime() + start * 60000);
    slots.push({
      time: at.toISOString(),
      label: at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      staffIds: freeStaff.map((s) => s.id),
    });
  }

  return slots;
}

export function isSlotTaken(params: {
  scheduledAt: Date;
  durationMin: number;
  staffId: number | null;
  bookings: BookingRow[];
}): boolean {
  const { scheduledAt, durationMin, staffId, bookings } = params;
  const start = scheduledAt.getTime();
  const end = start + durationMin * 60000;
  return bookings.some((b) => {
    if (b.status === "cancelled" || b.status === "no_show") return false;
    if (staffId && b.staffId && b.staffId !== staffId) return false;
    const bStart = (b.scheduledAt instanceof Date ? b.scheduledAt : new Date(b.scheduledAt)).getTime();
    const bEnd = bStart + b.durationMin * 60000;
    return start < bEnd && bStart < end;
  });
}
