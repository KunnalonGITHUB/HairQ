"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SalonTopBar } from "@/components/customer/chrome";
import { IconCheck } from "@/components/icons";
import { api, cx, Spinner, toast, usePoll } from "@/components/ui";
import { readProfile, writeProfile } from "@/lib/local-identity";
import { ensurePushSubscription } from "@/lib/push-client";
import { formatSalonDate, formatSalonTime } from "@/lib/salon-time";
import type { PublicState } from "@/lib/public-types";

type SlotsPayload = {
  days: { date: string; weekday: string; dayNum: number; month: string; closed: boolean }[];
  date: string;
  slots: { time: string; label: string; staffIds: number[]; available: boolean }[];
  service: { id: number; name: string; durationMin: number; price: number };
};

/** How often open booking screens re-check the shared slot availability. */
const SLOT_REFRESH_MS = 10000;

export function BookFlow({ slug }: { slug: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const { data } = usePoll<PublicState>(`/api/public/${slug}`, 30000);

  const [serviceId, setServiceId] = useState<number | null>(null);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [slotData, setSlotData] = useState<SlotsPayload | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notify, setNotify] = useState(true);
  const [offers, setOffers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const profile = readProfile(slug);
    if (profile.name) setName(profile.name);
    if (profile.phone) setPhone(profile.phone);
    const preset = Number(search.get("service"));
    if (preset) setServiceId(preset);
  }, [slug, search]);

  useEffect(() => {
    if (!serviceId && data?.services.length) setServiceId(data.services[0].id);
  }, [data, serviceId]);

  // Latest values for the background refresh, which runs outside render.
  const dateRef = useRef<string | null>(null);
  const slotRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const loadingRef = useRef(false);
  const requestSeq = useRef(0);
  useEffect(() => {
    dateRef.current = date;
    slotRef.current = slot;
    busyRef.current = busy;
  }, [date, slot, busy]);

  /**
   * Loads slots from the server (the shared source of truth).
   * `silent` is the background refresh: no skeleton, and the current
   * selection is kept unless someone else has just booked it.
   */
  const loadSlots = useCallback(
    async (targetDate?: string, silent = false) => {
      if (!serviceId) return;
      // A visible load is already on its way; a background refresh would only race it.
      if (silent && (loadingRef.current || busyRef.current)) return;
      const seq = ++requestSeq.current;
      if (!silent) {
        loadingRef.current = true;
        setLoadingSlots(true);
      }
      try {
        const params = new URLSearchParams({ serviceId: String(serviceId) });
        if (staffId) params.set("staffId", String(staffId));
        if (targetDate) params.set("date", targetDate);
        const res = await fetch(`/api/public/${slug}/book?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as SlotsPayload;
        // Ignore answers to requests that a newer one has replaced, and
        // background answers that land while the customer is confirming.
        if (seq !== requestSeq.current || (silent && busyRef.current)) return;
        setSlotData(json);
        setDate(json.date);
        if (!silent) {
          setSlot(null);
        } else if (
          slotRef.current &&
          !json.slots.some((s) => s.time === slotRef.current && s.available)
        ) {
          setSlot(null);
          toast("Someone just booked that time. Please pick another slot.", "err");
        }
      } catch {
        if (!silent) toast("Couldn't load available times. Check your connection.", "err");
      } finally {
        if (!silent && seq === requestSeq.current) {
          loadingRef.current = false;
          setLoadingSlots(false);
        }
      }
    },
    [serviceId, staffId, slug],
  );

  useEffect(() => {
    if (serviceId) loadSlots(date ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, staffId]);

  // Keep slots in step with bookings made on other devices.
  useEffect(() => {
    if (!serviceId) return;
    const refresh = () => {
      if (document.visibilityState === "visible") loadSlots(dateRef.current ?? undefined, true);
    };
    const id = setInterval(refresh, SLOT_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [serviceId, loadSlots]);

  const service = useMemo(
    () => data?.services.find((s) => s.id === serviceId) ?? null,
    [data, serviceId],
  );

  const submit = async () => {
    setError(null);
    if (!serviceId) return setError("Choose a service.");
    if (!slot) return setError("Pick a time that works for you.");
    if (!name.trim()) return setError("Please add your name.");
    if (phone.replace(/\D/g, "").length < 7) return setError("Please add a valid phone number.");

    setBusy(true);
    busyRef.current = true;
    try {
      const res = await api<{ token: string; customerId: number }>(`/api/public/${slug}/book`, {
        body: { name: name.trim(), phone: phone.trim(), serviceId, staffId, scheduledAt: slot },
      });
      writeProfile(slug, {
        name: name.trim(),
        phone: phone.trim(),
        customerId: res.customerId,
        booking: res.token,
      });
      if (notify || offers) {
        const push = await ensurePushSubscription(slug, res.customerId, {
          queueOptIn: notify,
          bookingOptIn: notify,
          marketingOptIn: offers,
        });
        if (!push.ok && push.status !== "dismissed") toast(push.message, "err");
      }
      router.push(`/s/${slug}/b/${res.token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
      loadSlots(date ?? undefined);
    }
  };

  if (!data) {
    return <div className="mx-auto max-w-xl px-4 py-20 text-center text-sm text-muted">Loading…</div>;
  }

  if (!data.salon.acceptingBookings) {
    return (
      <>
        <SalonTopBar slug={slug} name={data.salon.name} back={{ href: `/s/${slug}`, label: "Back" }} />
        <main className="mx-auto max-w-xl px-4 py-16 text-center">
          <h1 className="text-[20px] font-semibold tracking-[-0.02em]">Online booking is off right now</h1>
          <p className="mx-auto mt-2 max-w-sm text-[14px] text-muted">
            {data.salon.name} is only taking walk-ins today. Join the live queue when you arrive, or give the
            salon a call.
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <SalonTopBar
        slug={slug}
        name={data.salon.name}
        logoUrl={data.salon.logoUrl}
        back={{ href: `/s/${slug}`, label: "Back" }}
      />
      <main className="mx-auto max-w-xl px-4 pb-28">
        <div className="pt-6">
          <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.025em]">Book an appointment</h1>
          <p className="mt-1.5 text-[13.5px] text-muted">
            Pick a time that suits you — we&apos;ll keep the chair free.
          </p>
        </div>

        <section className="mt-6">
          <p className="lbl">Service</p>
          <div className="thin-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {data.services.map((s) => (
              <button
                key={s.id}
                onClick={() => setServiceId(s.id)}
                className={cx(
                  "shrink-0 rounded-xl border px-3.5 py-2.5 text-left transition-all",
                  serviceId === s.id
                    ? "border-transparent bg-ink text-white"
                    : "border-line bg-surface hover:border-line-2",
                )}
              >
                <span className="block text-[13.5px] font-medium">{s.name}</span>
                <span
                  className={cx("num block text-[12px]", serviceId === s.id ? "text-white/60" : "text-muted")}
                >
                  {s.durationMin} min · ₹{s.price}
                </span>
              </button>
            ))}
          </div>
        </section>

        {data.staff.length > 0 ? (
          <section className="mt-6">
            <p className="lbl">Barber</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setStaffId(null)}
                className={cx(
                  "rounded-lg border px-3 py-2 text-[13.5px] font-medium transition-all",
                  staffId === null ? "border-transparent bg-ink text-white" : "border-line bg-surface text-ink-2",
                )}
              >
                Anyone
              </button>
              {data.staff.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setStaffId(m.id)}
                  className={cx(
                    "rounded-lg border px-3 py-2 text-[13.5px] font-medium transition-all",
                    staffId === m.id ? "border-transparent bg-ink text-white" : "border-line bg-surface text-ink-2",
                  )}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-6">
          <p className="lbl">Date</p>
          <div className="thin-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {slotData?.days.map((d) => (
              <button
                key={d.date}
                disabled={d.closed}
                onClick={() => loadSlots(d.date)}
                className={cx(
                  "w-[62px] shrink-0 rounded-xl border py-2.5 text-center transition-all",
                  d.date === date
                    ? "border-transparent bg-ink text-white"
                    : d.closed
                      ? "border-line bg-paper-2 text-faint"
                      : "border-line bg-surface hover:border-line-2",
                )}
              >
                <span className="block text-[11px] uppercase tracking-wide opacity-70">{d.weekday}</span>
                <span className="num block text-[17px] font-semibold leading-tight">{d.dayNum}</span>
                <span className="block text-[10.5px] opacity-60">{d.closed ? "Closed" : d.month}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <p className="lbl">Available times</p>
          {loadingSlots ? (
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-line/60" />
              ))}
            </div>
          ) : slotData && slotData.slots.length > 0 ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {slotData.slots.map((s) =>
                s.available ? (
                  <button
                    key={s.time}
                    onClick={() => setSlot(s.time)}
                    className={cx(
                      "num rounded-lg border py-2.5 text-[13px] font-medium transition-all",
                      slot === s.time
                        ? "border-transparent text-white"
                        : "border-line bg-surface text-ink-2 hover:border-line-2",
                    )}
                    style={slot === s.time ? { background: "var(--brand)" } : undefined}
                  >
                    {s.label}
                  </button>
                ) : (
                  <button
                    key={s.time}
                    type="button"
                    disabled
                    aria-label={`${s.label}, booked`}
                    className="num cursor-not-allowed rounded-lg border border-line bg-paper-2 py-1.5 text-[13px] font-medium leading-tight text-faint"
                  >
                    <span className="line-through">{s.label}</span>
                    <span className="block text-[10.5px] font-normal">Booked</span>
                  </button>
                ),
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-surface px-4 py-6 text-center">
              <p className="text-[14px] font-medium">No free slots on this day</p>
              <p className="mt-1 text-[13px] text-muted">
                Try another date, or join the live queue when the salon is open.
              </p>
            </div>
          )}
        </section>

        <section className="mt-7">
          <p className="lbl">Your details</p>
          <div className="space-y-2.5">
            <input
              className="field"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
            <input
              className="field"
              placeholder="Phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
            />
          </div>
          <div className="mt-3.5 space-y-2 rounded-xl border border-line bg-surface p-3.5">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
              />
              <span className="text-[13px] leading-snug">
                <span className="font-medium">Remind me before my appointment</span>
                <span className="block text-muted">Booking confirmations and reminders.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={offers}
                onChange={(e) => setOffers(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
              />
              <span className="text-[13px] leading-snug">
                <span className="font-medium">Send me offers from {data.salon.name}</span>
                <span className="block text-muted">You can turn this off anytime.</span>
              </span>
            </label>
          </div>
        </section>

        {error ? (
          <p className="mt-4 rounded-lg border border-[#f0d7d5] bg-rose-soft px-3.5 py-2.5 text-[13px] text-rose">
            {error}
          </p>
        ) : null}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            {slot && service ? (
              <>
                <p className="truncate text-[13px] font-medium">
                  {formatSalonDate(new Date(slot), { weekday: "long", day: "numeric", month: "short" })}
                  {" · "}
                  {formatSalonTime(new Date(slot))}
                </p>
                <p className="num text-[12px] text-muted">
                  {service.name} · {service.durationMin} min · ₹{service.price}
                </p>
              </>
            ) : (
              <p className="text-[13px] text-muted">Select a time to continue</p>
            )}
          </div>
          <button className="btn btn-brand btn-lg" onClick={submit} disabled={busy || !slot}>
            {busy ? <Spinner /> : <IconCheck width={15} height={15} />}
            {busy ? "Booking…" : "Confirm booking"}
          </button>
        </div>
      </div>
    </>
  );
}
