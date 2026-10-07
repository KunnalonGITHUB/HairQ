import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { queueEntries, services, staff, staffServices } from "@/db/schema";
import { bool, fail, ok, str, withOwner } from "@/lib/api-helpers";

export async function GET() {
  return withOwner(async (user) => {
    const [team, svc, links, busy] = await Promise.all([
      db.select().from(staff).where(eq(staff.salonId, user.salonId)).orderBy(staff.id),
      db
        .select({ id: services.id, name: services.name, durationMin: services.durationMin })
        .from(services)
        .where(eq(services.salonId, user.salonId))
        .orderBy(services.sortOrder),
      db.select().from(staffServices).where(eq(staffServices.salonId, user.salonId)),
      db
        .select({ staffId: queueEntries.staffId, status: queueEntries.status })
        .from(queueEntries)
        .where(
          and(eq(queueEntries.salonId, user.salonId), inArray(queueEntries.status, ["waiting", "serving"])),
        ),
    ]);

    return ok({
      staff: team.map((s) => ({
        ...s,
        serviceIds: links.filter((l) => l.staffId === s.id).map((l) => l.serviceId),
        serving: busy.some((b) => b.staffId === s.id && b.status === "serving"),
        waitingFor: busy.filter((b) => b.staffId === s.id && b.status === "waiting").length,
      })),
      services: svc,
    });
  });
}

export async function POST(request: Request) {
  return withOwner(async (user) => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = str(body.name);
    if (!name) return fail("Add the team member's name.");

    const [created] = await db
      .insert(staff)
      .values({
        salonId: user.salonId,
        name,
        role: str(body.role) || "Barber",
        bio: str(body.bio) || null,
        photoUrl: str(body.photoUrl) || null,
        active: bool(body.active, true),
        onShift: bool(body.onShift, true),
        shiftStart: str(body.shiftStart) || "10:00",
        shiftEnd: str(body.shiftEnd) || "21:00",
      })
      .returning();

    const serviceIds = Array.isArray(body.serviceIds)
      ? (body.serviceIds as unknown[]).map(Number).filter(Boolean)
      : [];
    if (serviceIds.length > 0) {
      await db
        .insert(staffServices)
        .values(serviceIds.map((serviceId) => ({ salonId: user.salonId, staffId: created.id, serviceId })));
    }
    return ok({ staff: created }, 201);
  });
}
