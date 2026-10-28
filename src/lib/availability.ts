import { toMinutes } from "./time";
import { formatSalonTime, salonClock, salonStartOfDay } from "./salon-time";

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

/** Every bookable start time sits on this grid: 10:00, 10:30, 11:00 … */
export const SLOT_INTERVAL_MIN = 30;

export type Slot = {
  time: string; // ISO
  label: string;
  /** Barbers free for this slot. Empty when the slot is booked. */
  staffIds: number[];
  /** False when the slot is within hours but every eligible barber is already booked. */
  available: boolean;
};

/** True when the time is exactly on a :00 or :30 boundary of the salon clock. */
export function isOnSlotGrid(date: Date): boolean {
  if (!Number.isFinite(date.getTime()) || date.getMilliseconds() !== 0) return false;
  const clock = salonClock(date);
  return clock.second === 0 && clock.minute % SLOT_INTERVAL_MIN === 0;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

export function buildSlots(params: {
  day: Date;
  hours: HoursRow | undefined;
  durationMin: number;
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

  // Salon midnight, so opening hours are read on the salon's own clock.
  const dayStart = salonStartOfDay(day);

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

  // Align to the clock grid so a 10:15 opening yields 10:30, 11:00 …
  const firstStart = Math.ceil(open / SLOT_INTERVAL_MIN) * SLOT_INTERVAL_MIN;

  for (let start = firstStart; start + durationMin <= close; start += SLOT_INTERVAL_MIN) {
    const end = start + durationMin;
    if (start < minStart) continue;
    if (breakStart !== null && breakEnd !== null && overlaps(start, end, breakStart, breakEnd)) {
      continue;
    }

    const onShift = eligibleStaff.filter((s) => {
      const shiftStart = toMinutes(s.shiftStart) ?? open;
      const shiftEnd = toMinutes(s.shiftEnd) ?? close;
      return start >= shiftStart && end <= shiftEnd;
    });

    // Nobody works this slot at all: not bookable, so not shown.
    if (onShift.length === 0) continue;

    const freeStaff = onShift.filter(
      (s) =>
        !dayBookings.some(
          (b) => (b.staffId === null || b.staffId === s.id) && overlaps(start, end, b.start, b.end),
        ),
    );

    const at = new Date(dayStart.getTime() + start * 60000);
    slots.push({
      time: at.toISOString(),
      label: formatSalonTime(at),
      staffIds: freeStaff.map((s) => s.id),
      available: freeStaff.length > 0,
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
