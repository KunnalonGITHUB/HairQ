import { serviceRepository, staffRepository } from "@/lib/firestore/repositories";
import { and, eq } from "@/lib/firestore/query";

import { services, staff } from "@/lib/firestore/fields";
import { fail, guarded, ok } from "@/lib/api-helpers";
import {
  getActiveOffers,
  getHours,
  getSalonBySlug,
  loadLiveQueue,
  openStatus,
} from "@/lib/salon-data";
import { clockLabel } from "@/lib/time";

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return guarded(async () => {
    const { slug } = await ctx.params;
    const salon = await getSalonBySlug(slug);
    if (!salon) return fail("We couldn't find that salon link.", 404);

    const now = new Date();
    const [hours, live, svc, team, offers] = await Promise.all([
      getHours(salon.id),
      loadLiveQueue(salon.id, now),
      serviceRepository.find(salon.id, { where: and(eq(services.salonId, salon.id), eq(services.active, true)), orderBy: [services.sortOrder, services.id] }),
      staffRepository.find(salon.id, { where: and(eq(staff.salonId, salon.id), eq(staff.active, true)), orderBy: [staff.id] }),
      getActiveOffers(salon.id),
    ]);

    const status = openStatus(hours, now);
    const nextOpening = live.projection.nextOpeningAt;

    return ok({
      salon: {
        id: salon.id,
        slug: salon.slug,
        name: salon.name,
        tagline: salon.tagline,
        about: salon.about,
        logoUrl: salon.logoUrl,
        heroImageUrl: salon.heroImageUrl,
        brandColor: salon.brandColor,
        brandInk: salon.brandInk,
        phone: salon.phone,
        whatsapp: salon.whatsapp,
        email: salon.email,
        address: salon.address,
        mapsUrl: salon.mapsUrl,
        instagram: salon.instagram,
        queueStatus: salon.queueStatus,
        maxQueueSize: salon.maxQueueSize,
        acceptingBookings: salon.acceptingBookings,
        bookingHorizonDays: salon.bookingHorizonDays,
        allowServiceChange: salon.allowServiceChange,
        currency: salon.currency,
        pwaName: salon.pwaName ?? salon.name,
      },
      hours,
      open: status.open,
      openLabel: status.label,
      services: svc,
      staff: team.map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        photoUrl: s.photoUrl,
        bio: s.bio,
        onShift: s.onShift,
      })),
      offers,
      queue: {
        status: salon.queueStatus,
        waiting: live.waiting.length,
        serving: live.serving.length,
        full: live.waiting.length >= salon.maxQueueSize,
        chairCount: live.chairCount,
        nextOpeningInMin: live.projection.nextOpeningInMin,
        nextOpeningLabel: clockLabel(nextOpening),
        workloadMin: live.projection.workloadMin,
        preview: live.waiting.slice(0, 6).map((e) => ({
          position: e.projPosition,
          initial: e.customerName.split(" ")[0]?.slice(0, 1) ?? "G",
          serviceName: e.serviceName,
          durationMin: e.durationMin,
        })),
        inChair: live.serving.map((e) => ({
          initial: e.customerName.split(" ")[0]?.slice(0, 1) ?? "G",
          serviceName: e.serviceName,
          staffName: e.staffName,
        })),
      },
      now: now.toISOString(),
    });
  });
}
