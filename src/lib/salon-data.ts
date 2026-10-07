import { and, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  customers,
  notifications,
  offers,
  pushSubscriptions,
  queueEntries,
  salons,
  services,
  staff,
  staffServices,
  workingHours,
} from "@/db/schema";
import { projectQueue, type EngineEntry } from "./queue-engine";
import { clockLabel, toMinutes } from "./time";
import { sendPushToCustomers } from "./web-push";

export async function getSalonBySlug(slug: string) {
  const rows = await db.select().from(salons).where(eq(salons.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function getSalonById(id: number) {
  const rows = await db.select().from(salons).where(eq(salons.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getHours(salonId: number) {
  return db
    .select()
    .from(workingHours)
    .where(eq(workingHours.salonId, salonId))
    .orderBy(workingHours.dayOfWeek);
}

export function openStatus(
  hours: { dayOfWeek: number; isClosed: boolean; openTime: string; closeTime: string }[],
  now = new Date(),
) {
  const today = hours.find((h) => h.dayOfWeek === now.getDay());
  if (!today || today.isClosed) return { open: false, label: "Closed today", today: today ?? null };
  const mins = now.getHours() * 60 + now.getMinutes();
  const open = toMinutes(today.openTime) ?? 0;
  const close = toMinutes(today.closeTime) ?? 1440;
  if (mins < open) return { open: false, label: `Opens at ${today.openTime}`, today };
  if (mins >= close) return { open: false, label: "Closed for the day", today };
  return { open: true, label: `Open until ${today.closeTime}`, today };
}

export type LiveEntry = {
  id: number;
  token: string;
  status: string;
  position: number;
  durationMin: number;
  source: string;
  chair: string | null;
  notes: string | null;
  joinedAt: Date;
  startedAt: Date | null;
  customerId: number;
  customerName: string;
  customerPhone: string;
  serviceId: number;
  serviceName: string;
  servicePrice: number;
  staffId: number | null;
  staffName: string | null;
  projPosition: number;
  ahead: number;
  startAtISO: string;
  startLabel: string;
  waitMin: number;
};

export async function loadLiveQueue(salonId: number, now = new Date()) {
  const [rows, chairsRaw] = await Promise.all([
    db
      .select({
        id: queueEntries.id,
        token: queueEntries.token,
        status: queueEntries.status,
        position: queueEntries.position,
        durationMin: queueEntries.durationMin,
        source: queueEntries.source,
        chair: queueEntries.chair,
        notes: queueEntries.notes,
        joinedAt: queueEntries.joinedAt,
        startedAt: queueEntries.startedAt,
        customerId: queueEntries.customerId,
        customerName: customers.name,
        customerPhone: customers.phone,
        serviceId: queueEntries.serviceId,
        serviceName: services.name,
        servicePrice: services.price,
        staffId: queueEntries.staffId,
      })
      .from(queueEntries)
      .innerJoin(customers, eq(customers.id, queueEntries.customerId))
      .innerJoin(services, eq(services.id, queueEntries.serviceId))
      .where(
        and(
          eq(queueEntries.salonId, salonId),
          inArray(queueEntries.status, ["waiting", "serving"]),
        ),
      )
      .orderBy(queueEntries.position, queueEntries.id),
    db
      .select({ id: staff.id, name: staff.name, active: staff.active, onShift: staff.onShift })
      .from(staff)
      .where(eq(staff.salonId, salonId))
      .orderBy(staff.id),
  ]);

  const staffNames = new Map(chairsRaw.map((s) => [s.id, s.name]));
  const chairs = chairsRaw
    .filter((s) => s.active && s.onShift)
    .map((s) => ({ staffId: s.id, name: s.name }));

  const engineEntries: EngineEntry[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    position: r.position,
    durationMin: r.durationMin,
    staffId: r.staffId,
    startedAt: r.startedAt,
  }));

  const projection = projectQueue(engineEntries, chairs, now);

  const entries: LiveEntry[] = rows.map((r) => {
    const p = projection.byEntry.get(r.id);
    const startAt = p?.startAt ?? now;
    return {
      ...r,
      staffName: r.staffId ? staffNames.get(r.staffId) ?? null : null,
      projPosition: p?.position ?? 0,
      ahead: p?.ahead ?? 0,
      startAtISO: startAt.toISOString(),
      startLabel: clockLabel(startAt),
      waitMin: p?.waitMin ?? 0,
    };
  });

  return {
    entries,
    serving: entries.filter((e) => e.status === "serving"),
    waiting: entries
      .filter((e) => e.status === "waiting")
      .sort((a, b) => a.projPosition - b.projPosition),
    chairs,
    chairCount: Math.max(1, chairs.length),
    projection,
  };
}

export async function getCatalogue(salonId: number) {
  const [svc, team, links] = await Promise.all([
    db
      .select()
      .from(services)
      .where(eq(services.salonId, salonId))
      .orderBy(services.sortOrder, services.id),
    db.select().from(staff).where(eq(staff.salonId, salonId)).orderBy(staff.id),
    db.select().from(staffServices).where(eq(staffServices.salonId, salonId)),
  ]);
  const map = new Map<number, Set<number>>();
  for (const link of links) {
    if (!map.has(link.staffId)) map.set(link.staffId, new Set());
    map.get(link.staffId)!.add(link.serviceId);
  }
  return { services: svc, staff: team, links, staffServiceMap: map };
}

export async function getActiveOffers(salonId: number) {
  const rows = await db
    .select()
    .from(offers)
    .where(eq(offers.salonId, salonId))
    .orderBy(desc(offers.createdAt));
  const now = Date.now();
  return rows.filter((o) => o.active && (!o.expiresAt || o.expiresAt.getTime() > now));
}

/** Finds-or-creates the single customer record for this phone inside this tenant. */
export async function upsertCustomer(params: {
  salonId: number;
  name: string;
  phone: string;
  source?: string;
  preferredStaffId?: number | null;
  notes?: string | null;
  email?: string | null;
}) {
  const phone = params.phone.replace(/[^\d+]/g, "");
  const existing = await db
    .select()
    .from(customers)
    .where(and(eq(customers.salonId, params.salonId), eq(customers.phone, phone)))
    .limit(1);

  if (existing[0]) {
    const row = existing[0];
    const patch: Partial<typeof customers.$inferInsert> = { lastActivityAt: new Date() };
    if (params.name && params.name !== row.name && row.name.trim() === "") patch.name = params.name;
    if (params.preferredStaffId) patch.preferredStaffId = params.preferredStaffId;
    if (params.notes) patch.notes = params.notes;
    if (params.email) patch.email = params.email;
    const [updated] = await db
      .update(customers)
      .set(patch)
      .where(eq(customers.id, row.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(customers)
    .values({
      salonId: params.salonId,
      name: params.name || "Guest",
      phone,
      email: params.email ?? null,
      notes: params.notes ?? null,
      preferredStaffId: params.preferredStaffId ?? null,
      source: params.source ?? "manual",
      lastActivityAt: new Date(),
    })
    .returning();
  return created;
}

export async function pushNotification(params: {
  salonId: number;
  customerId: number;
  type: "queue" | "booking" | "marketing";
  title: string;
  body: string;
  url?: string | null;
  campaignId?: number | null;
  respectOptIn?: boolean;
}) {
  if (params.respectOptIn) {
    const sub = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.customerId, params.customerId))
      .limit(1);
    const row = sub[0];
    if (!row) return null;
    if (params.type === "marketing" && !row.marketingOptIn) return null;
    if (params.type === "queue" && !row.queueOptIn) return null;
    if (params.type === "booking" && !row.bookingOptIn) return null;
  }
  const [row] = await db
    .insert(notifications)
    .values({
      salonId: params.salonId,
      customerId: params.customerId,
      campaignId: params.campaignId ?? null,
      type: params.type,
      title: params.title,
      body: params.body,
      url: params.url ?? null,
    })
    .returning();

  // Fan out over real Web Push so the device wakes even with the PWA closed.
  // Failures never block the in-app feed write above.
  try {
    const salon = await getSalonById(params.salonId);
    await sendPushToCustomers([params.customerId], {
      title: params.title,
      body: params.body,
      url: params.url ?? (salon ? `/s/${salon.slug}` : "/"),
      type: params.type,
      icon: salon ? salon.logoUrl || `/s/${salon.slug}/icon.svg` : null,
      badge: salon ? `/s/${salon.slug}/icon.svg` : null,
      tag: `hairq-${params.type}-${params.salonId}`,
      requireInteraction: params.type === "queue",
    });
  } catch (err) {
    console.error("[hairq:push] fan-out failed", err);
  }

  return row;
}

export async function nextQueuePosition(salonId: number) {
  const rows = await db
    .select({ max: sql<number>`coalesce(max(${queueEntries.position}), 0)` })
    .from(queueEntries)
    .where(
      and(eq(queueEntries.salonId, salonId), inArray(queueEntries.status, ["waiting", "serving"])),
    );
  return (rows[0]?.max ?? 0) + 1;
}

export async function dayBookings(salonId: number, day: Date) {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  return db
    .select({
      id: bookings.id,
      staffId: bookings.staffId,
      scheduledAt: bookings.scheduledAt,
      durationMin: bookings.durationMin,
      status: bookings.status,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.salonId, salonId),
        gte(bookings.scheduledAt, start),
        lte(bookings.scheduledAt, end),
        ne(bookings.status, "cancelled"),
      ),
    );
}

export function brandVars(salon: {
  brandColor: string;
  brandInk: string;
}): React.CSSProperties {
  return {
    ["--brand" as string]: salon.brandColor,
    ["--brand-ink" as string]: salon.brandInk,
    ["--brand-soft" as string]: `${salon.brandColor}14`,
    ["--brand-line" as string]: `${salon.brandColor}33`,
  };
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function money(amount: number, currency = "INR") {
  const symbol = currency === "INR" ? "₹" : currency === "USD" ? "$" : "";
  return `${symbol}${amount.toLocaleString("en-IN")}`;
}
