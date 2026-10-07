"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SalonMark, SalonTopBar } from "@/components/customer/chrome";
import { GetAppButton } from "@/components/customer/get-app";
import {
  IconChevronRight,
  IconClock,
  IconMapPin,
  IconPhone,
  IconScissors,
} from "@/components/icons";
import { cx, usePoll } from "@/components/ui";
import { readProfile } from "@/lib/local-identity";
import type { PublicState, TicketState } from "@/lib/public-types";
import { DAY_NAMES, humanDuration, minutesToLabel, toMinutes } from "@/lib/time";

function money(amount: number, currency: string) {
  const symbol = currency === "INR" ? "₹" : currency === "USD" ? "$" : "";
  return `${symbol}${amount.toLocaleString("en-IN")}`;
}

export function SalonHome({ slug }: { slug: string }) {
  const { data, error } = usePoll<PublicState>(`/api/public/${slug}`, 6000);
  const [ticket, setTicket] = useState<TicketState | null>(null);

  useEffect(() => {
    const profile = readProfile(slug);
    if (!profile.ticket) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/public/${slug}/queue/${profile.ticket}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as TicketState;
        if (alive) setTicket(json.active ? json : null);
      } catch {
        /* ignore */
      }
    };
    load();
    const id = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [slug]);

  const grouped = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, PublicState["services"]>();
    for (const s of data.services) {
      const list = map.get(s.category) ?? [];
      list.push(s);
      map.set(s.category, list);
    }
    return [...map.entries()];
  }, [data]);

  if (!data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <div className="h-7 w-40 animate-pulse rounded bg-line" />
        <div className="mt-5 h-48 animate-pulse rounded-2xl bg-line/70" />
        <div className="mt-4 h-24 animate-pulse rounded-2xl bg-line/50" />
        {error ? <p className="mt-6 text-sm text-muted">{error}</p> : null}
      </div>
    );
  }

  const { salon, queue } = data;
  const closedForQueue = !data.open || queue.status !== "open";
  const queueBlocked = closedForQueue || queue.full;

  const queueMessage = !data.open
    ? { head: "We're closed right now", sub: data.openLabel }
    : queue.status === "paused"
      ? { head: "Queue is paused", sub: "We'll start taking people again shortly." }
      : queue.status === "closed"
        ? { head: "Live queue is closed", sub: "You can still book a slot for later." }
        : queue.full
          ? { head: "Queue is full", sub: "Book a later slot and skip the wait." }
          : null;

  return (
    <>
      <SalonTopBar
        slug={slug}
        name={salon.name}
        logoUrl={salon.logoUrl}
        openLabel={data.openLabel}
        open={data.open}
      />

      <main className="mx-auto max-w-xl px-4">
        {ticket?.entry ? (
          <Link
            href={`/s/${slug}/q/${ticket.entry.token}`}
            className="rise mt-4 flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors"
            style={{ background: "var(--brand-soft)", borderColor: "var(--brand-line)" }}
          >
            <span className="relative flex h-2 w-2">
              <span
                className="live-dot absolute inline-flex h-full w-full rounded-full"
                style={{ background: "var(--brand)" }}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold leading-tight" style={{ color: "var(--brand)" }}>
                {ticket.entry.status === "serving"
                  ? "You're in the chair"
                  : `You're #${ticket.entry.position} in the queue`}
              </span>
              <span className="block truncate text-[12.5px] text-muted">
                {ticket.entry.serviceName} · around {ticket.entry.turnLabel}
              </span>
            </span>
            <IconChevronRight width={16} height={16} className="text-muted" />
          </Link>
        ) : null}

        {/* ---------------------------------------------------------- hero */}
        <section className="pt-7">
          <div className="flex items-start gap-3.5">
            <SalonMark name={salon.name} logoUrl={salon.logoUrl} size={52} />
            <div className="min-w-0 pt-0.5">
              <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.025em]">{salon.name}</h1>
              {salon.tagline ? (
                <p className="mt-1 text-[14px] leading-snug text-muted">{salon.tagline}</p>
              ) : null}
            </div>
            <GetAppButton slug={slug} salonName={salon.name} className="ml-auto mt-1 shrink-0" />
          </div>
        </section>

        {/* --------------------------------------------------- live queue */}
        <section className="mt-5 overflow-hidden rounded-2xl bg-ink text-white">
          <div className="px-5 pb-5 pt-4.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="live-dot absolute inline-flex h-full w-full rounded-full bg-[#7FC6A6]" />
                </span>
                Live queue
              </span>
              <span className="text-[11.5px] text-white/45">
                {queue.chairCount} {queue.chairCount === 1 ? "chair" : "chairs"} working
              </span>
            </div>

            {queueMessage ? (
              <div className="mt-4">
                <p className="text-[21px] font-semibold leading-tight tracking-[-0.02em]">{queueMessage.head}</p>
                <p className="mt-1 text-[13.5px] text-white/60">{queueMessage.sub}</p>
              </div>
            ) : (
              <div className="mt-4 flex items-end gap-5">
                <div>
                  <p className="num text-[46px] font-semibold leading-none tracking-[-0.04em]">
                    {queue.waiting}
                  </p>
                  <p className="mt-1.5 text-[12.5px] text-white/55">
                    {queue.waiting === 1 ? "person waiting" : "people waiting"}
                  </p>
                </div>
                <div className="mb-1 h-10 w-px bg-white/12" />
                <div className="mb-0.5">
                  <p className="text-[19px] font-semibold leading-none tracking-[-0.02em]">
                    {queue.waiting === 0 && queue.serving === 0
                      ? "Walk right in"
                      : `~ ${humanDuration(queue.nextOpeningInMin)}`}
                  </p>
                  <p className="mt-1.5 text-[12.5px] text-white/55">
                    {queue.waiting === 0 && queue.serving === 0
                      ? "No one is waiting"
                      : `Next free chair around ${queue.nextOpeningLabel}`}
                  </p>
                </div>
              </div>
            )}

            {queue.preview.length > 0 && !queueMessage ? (
              <div className="thin-scroll mt-4 flex gap-1.5 overflow-x-auto pb-0.5">
                {queue.inChair.map((p, i) => (
                  <span
                    key={`chair-${i}`}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#7FC6A6]/25 bg-[#7FC6A6]/10 px-2.5 py-1 text-[11.5px] text-[#9FD9BF]"
                  >
                    <IconScissors width={11} height={11} />
                    {p.serviceName}
                  </span>
                ))}
                {queue.preview.map((p) => (
                  <span
                    key={p.position}
                    className="num flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11.5px] text-white/60"
                  >
                    <span className="text-white/35">{p.position}</span>
                    {p.serviceName} · {p.durationMin}m
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-px bg-white/10">
            <Link
              href={queueBlocked ? `/s/${slug}/book` : `/s/${slug}/join`}
              className="flex items-center justify-center gap-2 py-3.5 text-[14.5px] font-semibold transition-colors"
              style={{ background: queueBlocked ? "#ffffff0d" : "var(--brand)" }}
            >
              {queueBlocked ? "Book a slot" : "Join live queue"}
            </Link>
            <Link
              href={queueBlocked ? `tel:${salon.phone ?? ""}` : `/s/${slug}/book`}
              className="flex items-center justify-center gap-2 bg-white/[0.04] py-3.5 text-[14.5px] font-medium text-white/80 transition-colors hover:bg-white/[0.08]"
            >
              {queueBlocked ? "Call the salon" : "Book for later"}
            </Link>
          </div>
        </section>

        {/* ------------------------------------------------------- offers */}
        {data.offers.length > 0 ? (
          <section className="mt-5">
            <div className="thin-scroll flex gap-2.5 overflow-x-auto pb-1">
              {data.offers.map((o) => (
                <div
                  key={o.id}
                  className="min-w-[230px] shrink-0 rounded-xl border px-3.5 py-3"
                  style={{ borderColor: "var(--brand-line)", background: "var(--brand-soft)" }}
                >
                  {o.badge ? (
                    <span
                      className="text-[10.5px] font-bold uppercase tracking-[0.08em]"
                      style={{ color: "var(--brand)" }}
                    >
                      {o.badge}
                    </span>
                  ) : null}
                  <p className="mt-0.5 text-[14px] font-semibold leading-snug">{o.title}</p>
                  {o.description ? (
                    <p className="mt-1 text-[12.5px] leading-snug text-muted">{o.description}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* ----------------------------------------------------- services */}
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Services</h2>
          <div className="mt-3 space-y-5">
            {grouped.map(([category, list]) => (
              <div key={category}>
                <p className="mb-1.5 text-[12.5px] font-medium text-faint">{category}</p>
                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  {list.map((s, i) => (
                    <Link
                      key={s.id}
                      href={`/s/${slug}/${queueBlocked ? "book" : "join"}?service=${s.id}`}
                      className={cx(
                        "flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-paper-2",
                        i > 0 && "border-t border-line",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14.5px] font-medium leading-tight">{s.name}</span>
                        <span className="num mt-0.5 block text-[12.5px] text-muted">
                          {s.durationMin} min
                          {s.description ? ` · ${s.description}` : ""}
                        </span>
                      </span>
                      <span className="num text-[14px] font-semibold">{money(s.price, salon.currency)}</span>
                      <IconChevronRight width={15} height={15} className="text-faint" />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* --------------------------------------------------------- team */}
        {data.staff.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Our team</h2>
            <div className="thin-scroll mt-3 flex gap-2.5 overflow-x-auto pb-1">
              {data.staff.map((m) => (
                <div
                  key={m.id}
                  className="w-[132px] shrink-0 rounded-xl border border-line bg-surface p-3"
                >
                  <SalonMark name={m.name} logoUrl={m.photoUrl} size={36} />
                  <p className="mt-2.5 truncate text-[13.5px] font-medium">{m.name}</p>
                  <p className="truncate text-[12px] text-muted">{m.role}</p>
                  <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-faint">
                    <span
                      className={cx("inline-block h-1.5 w-1.5 rounded-full", m.onShift ? "bg-pine" : "bg-line-2")}
                    />
                    {m.onShift ? "On shift" : "Off today"}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* -------------------------------------------------------- hours */}
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Opening hours</h2>
          <div className="mt-3 rounded-xl border border-line bg-surface px-3.5 py-1">
            {data.hours.map((h) => {
              const today = new Date(data.now).getDay() === h.dayOfWeek;
              return (
                <div
                  key={h.dayOfWeek}
                  className={cx(
                    "flex items-center justify-between py-2 text-[13.5px]",
                    h.dayOfWeek !== 6 && "border-b border-line",
                  )}
                >
                  <span className={cx(today ? "font-semibold text-ink" : "text-muted")}>
                    {DAY_NAMES[h.dayOfWeek]}
                    {today ? <span className="ml-2 text-[11px] font-normal text-faint">Today</span> : null}
                  </span>
                  <span className={cx("num", h.isClosed ? "text-faint" : today ? "font-medium" : "text-ink-2")}>
                    {h.isClosed
                      ? "Closed"
                      : `${minutesToLabel(toMinutes(h.openTime) ?? 0)} – ${minutesToLabel(
                          toMinutes(h.closeTime) ?? 0,
                        )}`}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ------------------------------------------------------- visit us */}
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Visit us</h2>
          <div className="mt-3 rounded-xl border border-line bg-surface p-4">
            {salon.about ? (
              <p className="mb-3.5 text-[13.5px] leading-relaxed text-ink-2">{salon.about}</p>
            ) : null}
            {salon.address ? (
              <p className="flex items-start gap-2.5 text-[13.5px] leading-snug text-ink-2">
                <IconMapPin width={16} height={16} className="mt-0.5 shrink-0 text-faint" />
                {salon.address}
              </p>
            ) : null}
            {salon.phone ? (
              <p className="mt-2.5 flex items-center gap-2.5 text-[13.5px] text-ink-2">
                <IconPhone width={16} height={16} className="shrink-0 text-faint" />
                {salon.phone}
              </p>
            ) : null}
            <p className="mt-2.5 flex items-center gap-2.5 text-[13.5px] text-ink-2">
              <IconClock width={16} height={16} className="shrink-0 text-faint" />
              {data.openLabel}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {salon.mapsUrl ? (
                <a href={salon.mapsUrl} target="_blank" rel="noreferrer" className="btn btn-quiet btn-sm">
                  Get directions
                </a>
              ) : null}
              {salon.phone ? (
                <a href={`tel:${salon.phone}`} className="btn btn-quiet btn-sm">
                  Call
                </a>
              ) : null}
              {salon.whatsapp ? (
                <a
                  href={`https://wa.me/${salon.whatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-quiet btn-sm"
                >
                  WhatsApp
                </a>
              ) : null}
              <GetAppButton slug={slug} salonName={salon.name} />
              <Link href={`/s/${slug}/me`} className="btn btn-ghost btn-sm">
                My visits
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
