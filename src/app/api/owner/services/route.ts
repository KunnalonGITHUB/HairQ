import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { services, staff, staffServices } from "@/db/schema";
import { bool, fail, num, ok, str, withOwner } from "@/lib/api-helpers";

export async function GET() {
  return withOwner(async (user) => {
    const [svc, team, links] = await Promise.all([
      db
        .select()
        .from(services)
        .where(eq(services.salonId, user.salonId))
        .orderBy(services.sortOrder, services.id),
      db.select().from(staff).where(eq(staff.salonId, user.salonId)).orderBy(staff.id),
      db.select().from(staffServices).where(eq(staffServices.salonId, user.salonId)),
    ]);
    return ok({
      services: svc.map((s) => ({
        ...s,
        staffIds: links.filter((l) => l.serviceId === s.id).map((l) => l.staffId),
      })),
      staff: team,
    });
  });
}

export async function POST(request: Request) {
  return withOwner(async (user) => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = str(body.name);
    const durationMin = num(body.durationMin) ?? 30;
    const price = num(body.price) ?? 0;
    if (!name) return fail("Give the service a name.");
    if (durationMin < 5 || durationMin > 480) return fail("Duration should be between 5 and 480 minutes.");

    const count = await db.select({ id: services.id }).from(services).where(eq(services.salonId, user.salonId));

    const [created] = await db
      .insert(services)
      .values({
        salonId: user.salonId,
        name,
        description: str(body.description) || null,
        category: str(body.category) || "Hair",
        price: Math.max(0, price),
        durationMin,
        active: bool(body.active, true),
        sortOrder: count.length,
      })
      .returning();

    const staffIds = Array.isArray(body.staffIds) ? (body.staffIds as unknown[]).map(Number) : [];
    if (staffIds.length > 0) {
      await db.insert(staffServices).values(
        staffIds.map((staffId) => ({ salonId: user.salonId, staffId, serviceId: created.id })),
      );
    }
    return ok({ service: created }, 201);
  });
}
