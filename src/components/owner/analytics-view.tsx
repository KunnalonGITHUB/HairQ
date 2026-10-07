"use client";

import { useState } from "react";
import { PageHead, Panel, StatTile } from "@/components/owner/shell";
import { cx, usePoll } from "@/components/ui";
import { DAY_SHORT, humanDuration } from "@/lib/time";

type Summary = {
  range: {
    days: number;
    customers: number;
    revenue: number;
    avgWait: number;
    avgTicket: number;
    newCustomers: number;
    repeatCustomers: number;
    totalCustomers: number;
    fromBooking: number;
    fromQueue: number;
    series: { date: string; label: string; weekday: number; customers: number; revenue: number }[];
    hours: { hour: number; count: number }[];
    weekdays: { day: number; count: number }[];
    services: { name: string; count: number; revenue: number }[];
    staff: { name: string; count: number; revenue: number }[];
  };
};

export function AnalyticsView() {
  const [days, setDays] = useState(30);
  const { data } = usePoll<Summary>(`/api/owner/summary?days=${days}`, 30000);

  if (!data) return <div className="h-80 animate-pulse rounded-xl bg-line/40" />;
  const r = data.range;
  const maxDay = Math.max(1, ...r.series.map((s) => s.customers));
  const maxWeekday = Math.max(1, ...r.weekdays.map((w) => w.count));
  const maxService = Math.max(1, ...r.services.map((s) => s.count));
  const total = Math.max(1, r.fromBooking + r.fromQueue);

  return (
    <>
      <PageHead
        title="Analytics"
        subtitle="Only the numbers that change what you do tomorrow."
        actions={
          <div className="flex rounded-lg border border-line bg-surface p-0.5">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cx(
                  "rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                  days === d ? "bg-ink text-white" : "text-muted hover:text-ink",
                )}
              >
                {d}d
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatTile label="Customers served" value={r.customers} sub={`Last ${r.days} days`} />
        <StatTile label="Revenue" value={`₹${r.revenue.toLocaleString("en-IN")}`} sub={`Avg ticket ₹${r.avgTicket}`} accent="clay" />
        <StatTile label="Average wait" value={r.avgWait ? humanDuration(r.avgWait) : "—"} sub="From joining to chair" accent="pine" />
        <StatTile
          label="Repeat customers"
          value={r.repeatCustomers}
          sub={`${r.newCustomers} new in this period`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="Customers per day">
          <div className="thin-scroll flex h-[150px] items-end gap-[3px] overflow-x-auto">
            {r.series.map((s) => (
              <div key={s.date} className="group flex min-w-[8px] flex-1 flex-col items-center justify-end gap-1">
                <span className="num text-[9px] text-faint opacity-0 transition-opacity group-hover:opacity-100">
                  {s.customers}
                </span>
                <div
                  className="w-full rounded-sm bg-line-2 transition-colors group-hover:bg-clay"
                  style={{ height: `${Math.max(2, (s.customers / maxDay) * 118)}px` }}
                  title={`${s.label}: ${s.customers} customers · ₹${s.revenue}`}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between border-t border-line pt-2 text-[11.5px] text-muted">
            <span>{r.series[0]?.label}</span>
            <span>{r.series[r.series.length - 1]?.label}</span>
          </div>
        </Panel>

        <Panel title="Busiest days">
          <div className="space-y-2">
            {r.weekdays.map((w) => (
              <div key={w.day} className="flex items-center gap-3">
                <span className="w-9 text-[12.5px] text-muted">{DAY_SHORT[w.day]}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper">
                  <div
                    className="h-full rounded-full bg-pine/70"
                    style={{ width: `${(w.count / maxWeekday) * 100}%` }}
                  />
                </div>
                <span className="num w-7 text-right text-[12.5px] font-medium">{w.count}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Most popular services" flush>
          {r.services.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted">No completed services yet.</p>
          ) : (
            r.services.slice(0, 6).map((s, i) => (
              <div key={s.name} className={cx("px-4 py-2.5", i > 0 && "border-t border-line")}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium">{s.name}</span>
                  <span className="num text-muted">{s.count}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper">
                  <div className="h-full rounded-full bg-clay/70" style={{ width: `${(s.count / maxService) * 100}%` }} />
                </div>
              </div>
            ))
          )}
        </Panel>

        <Panel title="Booking vs walk-in">
          <div className="flex h-4 overflow-hidden rounded-full">
            <div className="bg-pine" style={{ width: `${(r.fromBooking / total) * 100}%` }} />
            <div className="bg-clay" style={{ width: `${(r.fromQueue / total) * 100}%` }} />
          </div>
          <div className="mt-3 space-y-2 text-[13px]">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-pine" />
              <span className="flex-1 text-muted">Booked ahead</span>
              <span className="num font-medium">{r.fromBooking}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-clay" />
              <span className="flex-1 text-muted">Live queue / walk-in</span>
              <span className="num font-medium">{r.fromQueue}</span>
            </div>
          </div>
          <p className="mt-3 border-t border-line pt-3 text-[12px] leading-snug text-muted">
            {r.fromBooking > r.fromQueue
              ? "Most people plan ahead — consider opening more advance slots."
              : "Walk-ins dominate. Keeping the live queue open and accurate is your biggest lever."}
          </p>
        </Panel>

        <Panel title="Team" flush>
          {r.staff.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted">No services attributed to staff yet.</p>
          ) : (
            r.staff.map((s, i) => (
              <div key={s.name} className={cx("flex items-center justify-between px-4 py-3", i > 0 && "border-t border-line")}>
                <span className="text-[13.5px] font-medium">{s.name}</span>
                <span className="text-right">
                  <span className="num block text-[13px] font-medium">{s.count}</span>
                  <span className="num block text-[11.5px] text-muted">₹{s.revenue.toLocaleString("en-IN")}</span>
                </span>
              </div>
            ))
          )}
        </Panel>
      </div>
    </>
  );
}
