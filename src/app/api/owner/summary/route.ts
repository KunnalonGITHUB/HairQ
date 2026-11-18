import { visitRepository, bookingRepository, customerRepository, serviceRepository, staffRepository } from "@/lib/firestore/repositories";
import { and, asc, eq, gte, inArray, lte } from "@/lib/firestore/query";

import { bookings, customers, services, staff, visits } from "@/lib/firestore/fields";
import { fail, ok, withOwner } from "@/lib/api-helpers";
import { getSalonById, loadLiveQueue } from "@/lib/salon-data";
import {
  addDaysToKey,
  formatSalonDate,
  salonClock,
  salonDateKey,
  salonDayStart,
  salonEndOfDay,
  salonStartOfDay,
  salonWeekday,
} from "@/lib/salon-time";

export async function GET(request: Request) {
  return withOwner(async (user) => {
    const url = new URL(request.url);
    const days = Math.max(7, Math.min(90, Number(url.searchParams.get("days") ?? 30)));
    const now = new Date();
    // Days, hours and weekdays are the salon's (Asia/Kolkata), not the server's.
    const rangeStartKey = addDaysToKey(salonDateKey(now), -(days - 1));
    const rangeStart = salonDayStart(rangeStartKey);

    const salon = await getSalonById(user.salonId);
    if (!salon) return fail("Salon not found", 404);

    const [live, rangeVisits, todayBookings, upcoming, allCustomers, svc, team] = await Promise.all([
      loadLiveQueue(user.salonId, now),
      visitRepository.find(user.salonId, { where: and(eq(visits.salonId, user.salonId), gte(visits.completedAt, rangeStart)), orderBy: [asc(visits.completedAt)] }),
      bookingRepository.find(user.salonId, { select: {
          id: bookings.id,
          scheduledAt: bookings.scheduledAt,
          status: bookings.status,
          serviceId: bookings.serviceId,
          staffId: bookings.staffId,
          customerId: bookings.customerId,
        }, where: and(
            eq(bookings.salonId, user.salonId),
            gte(bookings.scheduledAt, salonStartOfDay(now)),
            lte(bookings.scheduledAt, salonEndOfDay(now)),
            inArray(bookings.status, ["confirmed", "arrived"]),
          ), orderBy: [asc(bookings.scheduledAt)] }),
      bookingRepository.find(user.salonId, { select: { id: bookings.id }, where: and(
            eq(bookings.salonId, user.salonId),
            gte(bookings.scheduledAt, now),
            inArray(bookings.status, ["confirmed", "arrived"]),
          ) }),
      customerRepository.find(user.salonId, { select: {
          id: customers.id,
          name: customers.name,
          totalVisits: customers.totalVisits,
          createdAt: customers.createdAt,
          lastVisitAt: customers.lastVisitAt,
        }, where: eq(customers.salonId, user.salonId) }),
      serviceRepository.find(user.salonId, { select: { id: services.id, name: services.name, price: services.price }, where: eq(services.salonId, user.salonId) }),
      staffRepository.find(user.salonId, { select: { id: staff.id, name: staff.name }, where: eq(staff.salonId, user.salonId) }),
    ]);

    const serviceNames = new Map(svc.map((s) => [s.id, s.name]));
    const staffNames = new Map(team.map((s) => [s.id, s.name]));
    const todayStart = salonStartOfDay(now).getTime();
    const todayVisits = rangeVisits.filter((v) => v.completedAt.getTime() >= todayStart);

    // --- series: visits per salon day across the range
    const series = Array.from({ length: days }, (_, i) => {
      const key = addDaysToKey(rangeStartKey, i);
      const day = salonDayStart(key);
      const dayVisits = rangeVisits.filter((v) => salonDateKey(v.completedAt) === key);
      return {
        date: key,
        label: formatSalonDate(day, { day: "numeric", month: "short" }),
        weekday: salonWeekday(day),
        customers: dayVisits.length,
        revenue: dayVisits.reduce((s, v) => s + v.amount, 0),
      };
    });

    // --- busy hours (visits bucketed by salon hour of completion)
    const hourBuckets = Array.from({ length: 14 }, (_, i) => ({ hour: i + 9, count: 0 }));
    for (const v of rangeVisits) {
      const h = salonClock(v.completedAt).hour;
      const bucket = hourBuckets.find((b) => b.hour === h);
      if (bucket) bucket.count += 1;
    }

    const weekdayTally = Array.from({ length: 7 }, (_, d) => ({
      day: d,
      count: rangeVisits.filter((v) => salonWeekday(v.completedAt) === d).length,
    }));

    // Each visit credits its main service with that service's price and each
    // extra with its own price. Older visits (no breakdown) credit the whole
    // amount to the main service, as before.
    const serviceTally = new Map<string, { name: string; count: number; revenue: number }>();
    const credit = (key: string, name: string, revenue: number) => {
      const entry = serviceTally.get(key) ?? { name, count: 0, revenue: 0 };
      entry.count += 1;
      entry.revenue += revenue;
      serviceTally.set(key, entry);
    };
    for (const v of rangeVisits) {
      const extras = v.extraServices ?? [];
      const extrasTotal = extras.reduce((s, x) => s + x.price, 0);
      if (v.serviceId) {
        credit(`service:${v.serviceId}`, serviceNames.get(v.serviceId) ?? "Service", v.serviceAmount ?? v.amount - extrasTotal);
      }
      for (const x of extras) {
        if (x.serviceId) credit(`service:${x.serviceId}`, serviceNames.get(x.serviceId) ?? x.name, x.price);
        else credit(`custom:${x.name.trim().toLowerCase()}`, x.name, x.price);
      }
    }

    const staffTally = new Map<number, { name: string; count: number; revenue: number }>();
    for (const v of rangeVisits) {
      if (!v.staffId) continue;
      const entry = staffTally.get(v.staffId) ?? {
        name: staffNames.get(v.staffId) ?? "Team",
        count: 0,
        revenue: 0,
      };
      entry.count += 1;
      entry.revenue += v.amount;
      staffTally.set(v.staffId, entry);
    }

    const avgWait = rangeVisits.length
      ? Math.round(rangeVisits.reduce((s, v) => s + v.waitMin, 0) / rangeVisits.length)
      : 0;
    const todayAvgWait = todayVisits.length
      ? Math.round(todayVisits.reduce((s, v) => s + v.waitMin, 0) / todayVisits.length)
      : 0;

    const newCustomers = allCustomers.filter((c) => c.createdAt.getTime() >= rangeStart.getTime()).length;
    const repeatCustomers = allCustomers.filter((c) => c.totalVisits >= 2).length;

    const nextBooking = todayBookings.find((b) => b.scheduledAt.getTime() >= now.getTime());

    return ok({
      salon: {
        name: salon.name,
        slug: salon.slug,
        queueStatus: salon.queueStatus,
        currency: salon.currency,
        maxQueueSize: salon.maxQueueSize,
      },
      today: {
        served: todayVisits.length,
        waiting: live.waiting.length,
        serving: live.serving.length,
        bookings: todayBookings.length,
        upcomingBookings: upcoming.length,
        revenue: todayVisits.reduce((s, v) => s + v.amount, 0),
        avgWait: todayAvgWait,
        workloadMin: live.projection.workloadMin,
        nextOpeningInMin: live.projection.nextOpeningInMin,
        chairCount: live.chairCount,
        nextBooking: nextBooking
          ? {
              at: nextBooking.scheduledAt,
              serviceName: serviceNames.get(nextBooking.serviceId) ?? "Service",
              staffName: nextBooking.staffId ? staffNames.get(nextBooking.staffId) ?? null : null,
            }
          : null,
      },
      queue: {
        serving: live.serving,
        waiting: live.waiting.slice(0, 6),
      },
      range: {
        days,
        customers: rangeVisits.length,
        revenue: rangeVisits.reduce((s, v) => s + v.amount, 0),
        avgWait,
        avgTicket: rangeVisits.length
          ? Math.round(rangeVisits.reduce((s, v) => s + v.amount, 0) / rangeVisits.length)
          : 0,
        newCustomers,
        repeatCustomers,
        totalCustomers: allCustomers.length,
        fromBooking: rangeVisits.filter((v) => v.source === "booking").length,
        fromQueue: rangeVisits.filter((v) => v.source !== "booking").length,
        series,
        hours: hourBuckets,
        weekdays: weekdayTally,
        services: [...serviceTally.values()].sort((a, b) => b.count - a.count),
        staff: [...staffTally.values()].sort((a, b) => b.count - a.count),
      },
    });
  }, request);
}
