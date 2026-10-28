/**
 * Salon wall-clock time.
 *
 * Bookings are stored as exact instants (Firestore Timestamps). Everything
 * that turns an instant into a day, an hour or a label — slot generation,
 * validation, booking windows and every booking time shown on screen — goes
 * through this module so the server (UTC on Vercel) and every browser agree
 * on the salon's own clock, whatever timezone they run in.
 *
 * Safe to import on both server and client.
 */

/** HairQ salons operate in India. */
export const SALON_TIME_ZONE = "Asia/Kolkata";

const LOCALE = "en-US";

const partsFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: SALON_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type SalonClock = {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday, matching workingHours.dayOfWeek */
  weekday: number;
  minutesOfDay: number;
};

/** The salon's wall-clock reading for an instant. */
export function salonClock(date: Date): SalonClock {
  const parts: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(date)) parts[part.type] = part.value;
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute,
    second: Number(parts.second),
    weekday: WEEKDAYS.indexOf(parts.weekday),
    minutesOfDay: hour * 60 + minute,
  };
}

/** Milliseconds the salon clock is ahead of UTC at this instant. */
function offsetMs(date: Date): number {
  const c = salonClock(date);
  const wholeSeconds = Math.floor(date.getTime() / 1000) * 1000;
  return Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second) - wholeSeconds;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** True for a well-formed calendar date key such as "2030-01-02". */
export function isSalonDateKey(key: string): boolean {
  const match = KEY_PATTERN.exec(key);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** "YYYY-MM-DD" of the salon calendar day containing this instant. */
export function salonDateKey(date: Date): string {
  const c = salonClock(date);
  return `${c.year}-${pad(c.month)}-${pad(c.day)}`;
}

/** Shift a date key by whole calendar days. */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** The instant a salon calendar day begins (salon midnight). */
export function salonDayStart(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const wallMidnight = Date.UTC(y, m - 1, d);
  // A second pass settles the offset in zones with daylight saving.
  let t = wallMidnight - offsetMs(new Date(wallMidnight));
  t = wallMidnight - offsetMs(new Date(t));
  return new Date(t);
}

/** The instant at `minutes` past salon midnight on that day. */
export function salonTimeOnDay(key: string, minutes: number): Date {
  return new Date(salonDayStart(key).getTime() + minutes * 60000);
}

export function salonStartOfDay(date: Date): Date {
  return salonDayStart(salonDateKey(date));
}

/** Last millisecond of the salon day containing this instant. */
export function salonEndOfDay(date: Date): Date {
  return new Date(salonDayStart(addDaysToKey(salonDateKey(date), 1)).getTime() - 1);
}

/** Weekday (0 = Sunday) of the salon day containing this instant. */
export function salonWeekday(date: Date): number {
  return salonClock(date).weekday;
}

/** Rounds up to the next :00 or :30 on the salon clock (unchanged if already on one). */
export function nextSalonHalfHour(date: Date): Date {
  const c = salonClock(date);
  const secondsIntoDay = c.minutesOfDay * 60 + c.second + (date.getTime() % 1000 ? 1 : 0);
  return salonTimeOnDay(salonDateKey(date), Math.ceil(secondsIntoDay / 1800) * 30);
}

/** "4:30 PM" on the salon clock. */
export function formatSalonTime(date: Date): string {
  return date.toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit", timeZone: SALON_TIME_ZONE });
}

/** Date text on the salon clock, e.g. { weekday: "long" } → "Wednesday". */
export function formatSalonDate(date: Date, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString(LOCALE, { ...options, timeZone: SALON_TIME_ZONE });
}

/** Today / Tomorrow / Yesterday / "Wed, 2 Jan", judged by salon calendar days. */
export function relativeSalonDay(date: Date, now: Date = new Date()): string {
  const diff = Math.round(
    (salonDayStart(salonDateKey(date)).getTime() - salonDayStart(salonDateKey(now)).getTime()) / 86400000,
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return formatSalonDate(date, { weekday: "short", day: "numeric", month: "short" });
}

/** Value for an <input type="datetime-local"> showing the salon clock. */
export function toSalonInputValue(date: Date): string {
  const c = salonClock(date);
  return `${salonDateKey(date)}T${pad(c.hour)}:${pad(c.minute)}`;
}

/** Reads an <input type="datetime-local"> value as salon time. */
export function fromSalonInputValue(value: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match || !isSalonDateKey(match[1])) return null;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (hour > 23 || minute > 59) return null;
  return salonTimeOnDay(match[1], hour * 60 + minute);
}
