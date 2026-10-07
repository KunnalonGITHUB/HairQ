"use client";

import Link from "next/link";
import { PageHead, Panel, StatTile } from "@/components/owner/shell";
import { IconChevronRight, IconPlus, IconQueue } from "@/components/icons";
import { cx, EmptyState, StatusChip, usePoll } from "@/components/ui";
import { humanDuration } from "@/lib/time";

type Summary = {
  salon: { name: string; slug: string; queueStatus: string; currency: string; maxQueueSize: number };
  today: {
    served: number;
    waiting: number;
    serving: number;
    bookings: number;
    upcomingBookings: number;
    revenue: number;
    avgWait: number;
    workloadMin: number;
    nextOpeningInMin: number;
    chairCount: number;
    nextBooking: { at: string; serviceName: string; staffName: string | null } | null;
  };
  queue: {
    serving: { id: number; customerName: string; serviceName: string; staffName: string | null; startedAt: string | null }[];
    waiting: {
      id: number;
      customerName: string;
      serviceName: string;
      staffName: string | null;
      projPosition: number;
      startLabel: string;
      durationMin: number;
    }[];
  };
  range: {
    hours: { hour: number; count: number }[];
    services: { name: string; count: number; revenue: number }[];
    customers: number;
    newCustomers: number;
    repeatCustomers: number;
    totalCustomers: number;
  };
};

const QUICK = [
  { href: "/dashboard/queue?add=1", label: "Add walk-in", hint: "Someone just walked in" },
  { href: "/dashboard/bookings?add=1", label: "Add booking", hint: "Phone appointment" },
  { href: "/dashboard/customers?add=1", label: "Add customer", hint: "Save their details" },
  { href: "/dashboard/notifications", label: "Send notification", hint: "Fill a quiet afternoon" },
];

export function DashboardView({ ownerName }: { ownerName: string }) {
  const { data } = usePoll<Summary>("/api/owner/summary?days=30", 10000);

  if (!data) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-56 animate-pulse rounded bg-line" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-line/60" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-xl bg-line/40" />
      </div>
    );
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const peak = [...data.range.hours].sort((a, b) => b.count - a.count)[0];
  const maxHour = Math.max(1, ...data.range.hours.map((h) => h.count));

  return (
    <>
      <PageHead
        title={`${greeting}, ${ownerName.split(" ")[0]}`}
        subtitle={new Date().toLocaleDateString("en-US", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        actions={
          <>
            <Link href={`/s/${data.salon.slug}`} target="_blank" className="btn btn-quiet">
              View salon page
            </Link>
            <Link href="/dashboard/queue?add=1" className="btn btn-primary">
              <IconPlus width={15} height={15} />
              Add walk-in
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <StatTile
          label="Waiting now"
          value={data.today.waiting}
          sub={
            data.today.waiting > 0
              ? `Clears in ~${humanDuration(data.today.workloadMin)}`
              : "Queue is clear"
          }
          accent="clay"
        />
        <StatTile
          label="In the chair"
          value={data.today.serving}
          sub={`${data.today.chairCount} ${data.today.chairCount === 1 ? "chair" : "chairs"} working`}
          accent="pine"
        />
        <StatTile label="Served today" value={data.today.served} sub={`Avg wait ${data.today.avgWait} min`} />
        <StatTile
          label="Bookings today"
          value={data.today.bookings}
          sub={
            data.today.nextBooking
              ? `Next ${new Date(data.today.nextBooking.at).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })} · ${data.today.nextBooking.serviceName}`
              : "Nothing else booked today"
          }
        />
        <StatTile
          label="Revenue estimate"
          value={`₹${data.today.revenue.toLocaleString("en-IN")}`}
          sub="From completed services"
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
        <Panel
          title="Queue right now"
          flush
          action={
            <Link href="/dashboard/queue" className="btn btn-ghost btn-sm">
              Manage
              <IconChevronRight width={14} height={14} />
            </Link>
          }
        >
          {data.queue.serving.length === 0 && data.queue.waiting.length === 0 ? (
            <EmptyState
              title="Your queue is clear"
              hint="When someone scans your QR or walks in, they'll show up here instantly."
              icon={<IconQueue width={18} height={18} />}
              action={
                <Link href="/dashboard/queue?add=1" className="btn btn-quiet btn-sm">
                  Add a walk-in
                </Link>
              }
            />
          ) : (
            <div>
              {data.queue.serving.map((e) => (
                <div key={e.id} className="flex items-center gap-3 border-b border-line bg-pine-soft/40 px-4 py-3">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-pine text-[11px] font-bold text-white">
                    ✂
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{e.customerName}</p>
                    <p className="truncate text-[12px] text-muted">
                      {e.serviceName} · {e.staffName ?? "Unassigned"}
                    </p>
                  </div>
                  <StatusChip status="serving" />
                </div>
              ))}
              {data.queue.waiting.map((e, i) => (
                <div
                  key={e.id}
                  className={cx("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-line")}
                >
                  <span className="num grid h-7 w-7 place-items-center rounded-lg bg-paper text-[12px] font-semibold text-ink-2">
                    {e.projPosition}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{e.customerName}</p>
                    <p className="truncate text-[12px] text-muted">
                      {e.serviceName} · {e.durationMin} min · {e.staffName ?? "Any barber"}
                    </p>
                  </div>
                  <span className="num text-[12.5px] font-medium text-ink-2">{e.startLabel}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Quick actions" flush>
            <div className="divide-y divide-line">
              {QUICK.map((q) => (
                <Link
                  key={q.href}
                  href={q.href}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium">{q.label}</span>
                    <span className="block text-[12px] text-muted">{q.hint}</span>
                  </span>
                  <IconChevronRight width={15} height={15} className="text-faint" />
                </Link>
              ))}
            </div>
          </Panel>

          <Panel title="Busy hours" action={<span className="text-[11.5px] text-muted">Last 30 days</span>}>
            <div className="flex h-[88px] items-end gap-[3px]">
              {data.range.hours.map((h) => (
                <div key={h.hour} className="group flex flex-1 flex-col items-center gap-1">
                  <div
                    className={cx(
                      "w-full rounded-sm transition-colors",
                      h.hour === new Date().getHours() ? "bg-clay" : "bg-line-2 group-hover:bg-clay/60",
                    )}
                    style={{ height: `${Math.max(3, (h.count / maxHour) * 72)}px` }}
                    title={`${h.count} customers around ${h.hour}:00`}
                  />
                  <span className="num text-[9px] text-faint">{h.hour % 12 === 0 ? 12 : h.hour % 12}</span>
                </div>
              ))}
            </div>
            <p className="mt-2.5 border-t border-line pt-2.5 text-[12.5px] text-muted">
              {peak && peak.count > 0
                ? `Busiest around ${peak.hour % 12 === 0 ? 12 : peak.hour % 12}${peak.hour >= 12 ? "pm" : "am"} — worth having two chairs open.`
                : "Not enough history yet. This fills in as you complete services."}
            </p>
          </Panel>

          <Panel title="Customers">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="num text-[20px] font-semibold leading-none">{data.range.totalCustomers}</p>
                <p className="mt-1 text-[11.5px] text-muted">Total</p>
              </div>
              <div>
                <p className="num text-[20px] font-semibold leading-none text-clay">{data.range.newCustomers}</p>
                <p className="mt-1 text-[11.5px] text-muted">New (30d)</p>
              </div>
              <div>
                <p className="num text-[20px] font-semibold leading-none text-pine">
                  {data.range.repeatCustomers}
                </p>
                <p className="mt-1 text-[11.5px] text-muted">Repeat</p>
              </div>
            </div>
            <Link href="/dashboard/customers" className="btn btn-quiet btn-sm mt-3.5 w-full">
              Open customer list
            </Link>
          </Panel>
        </div>
      </div>
    </>
  );
}
