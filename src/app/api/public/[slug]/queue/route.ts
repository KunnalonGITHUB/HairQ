import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { queueEntries, services } from "@/db/schema";
import { fail, guarded, num, ok, str, validPhone } from "@/lib/api-helpers";
import { newToken } from "@/lib/auth";
import {
  getHours,
  getSalonBySlug,
  loadLiveQueue,
  nextQueuePosition,
  openStatus,
  upsertCustomer,
} from "@/lib/salon-data";
import { syncQueueNotifications } from "@/lib/queue-actions";

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return guarded(async () => {
    const { slug } = await ctx.params;
    const salon = await getSalonBySlug(slug);
    if (!salon) return fail("We couldn't find that salon link.", 404);

    if (salon.queueStatus === "paused") {
      return fail("The queue is paused right now. Please try again in a few minutes or book a slot.", 409);
    }
    if (salon.queueStatus === "closed") {
      return fail("The live queue is closed. You can still book an appointment for later.", 409);
    }

    const hours = await getHours(salon.id);
    if (!openStatus(hours).open) {
      return fail("The salon is closed at the moment. Book a slot and we'll keep it for you.", 409);
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = str(body.name);
    const phone = str(body.phone);
    const serviceId = num(body.serviceId);
    const staffId = num(body.staffId);

    if (!name) return fail("Please tell us your name.");
    if (!validPhone(phone)) return fail("Please enter a valid phone number.");
    if (!serviceId) return fail("Choose the service you'd like.");

    const svcRows = await db
      .select()
      .from(services)
      .where(and(eq(services.id, serviceId), eq(services.salonId, salon.id), eq(services.active, true)))
      .limit(1);
    const service = svcRows[0];
    if (!service) return fail("That service isn't available right now.");

    const live = await loadLiveQueue(salon.id);
    if (live.waiting.length >= salon.maxQueueSize) {
      return fail("The queue is full for now. Try booking a later slot instead.", 409);
    }

    const customer = await upsertCustomer({
      salonId: salon.id,
      name,
      phone,
      source: "queue",
      preferredStaffId: staffId,
    });

    const existing = await db
      .select({ token: queueEntries.token })
      .from(queueEntries)
      .where(
        and(
          eq(queueEntries.salonId, salon.id),
          eq(queueEntries.customerId, customer.id),
          inArray(queueEntries.status, ["waiting", "serving"]),
        ),
      )
      .limit(1);
    if (existing[0]) {
      return ok({ token: existing[0].token, alreadyInQueue: true });
    }

    const position = await nextQueuePosition(salon.id);
    const [entry] = await db
      .insert(queueEntries)
      .values({
        salonId: salon.id,
        customerId: customer.id,
        serviceId: service.id,
        staffId: staffId ?? null,
        token: newToken(10),
        durationMin: service.durationMin,
        source: "online",
        notes: str(body.notes) || null,
        position,
      })
      .returning();

    await syncQueueNotifications(salon.id, salon.name, salon.slug);
    return ok({ token: entry.token, customerId: customer.id }, 201);
  });
}
