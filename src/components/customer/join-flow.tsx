"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SalonTopBar } from "@/components/customer/chrome";
import { IconCheck, IconScissors } from "@/components/icons";
import { api, cx, Spinner, toast, usePoll } from "@/components/ui";
import { readProfile, writeProfile } from "@/lib/local-identity";
import { ensurePushSubscription } from "@/lib/push-client";
import type { PublicState } from "@/lib/public-types";
import { clockLabel, humanDuration } from "@/lib/time";

export function JoinFlow({ slug }: { slug: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const { data } = usePoll<PublicState>(`/api/public/${slug}`, 10000);

  const [serviceId, setServiceId] = useState<number | null>(null);
  const [staffId, setStaffId] = useState<number | null>(null);
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

  const service = useMemo(
    () => data?.services.find((s) => s.id === serviceId) ?? null,
    [data, serviceId],
  );

  const eta = useMemo(() => {
    if (!data) return null;
    const mins = data.queue.nextOpeningInMin;
    const at = new Date(Date.now() + mins * 60000);
    return { mins, label: clockLabel(at) };
  }, [data]);

  if (!data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center text-sm text-muted">Loading…</div>
    );
  }

  const blocked =
    !data.open || data.queue.status !== "open" || data.queue.full
      ? !data.open
        ? "The salon is closed right now."
        : data.queue.status === "paused"
          ? "The queue is paused for a few minutes."
          : data.queue.status === "closed"
            ? "The live queue is closed for today."
            : "The queue is full right now."
      : null;

  const submit = async () => {
    setError(null);
    if (!serviceId) return setError("Choose the service you'd like.");
    if (!name.trim()) return setError("Please add your name.");
    if (phone.replace(/\D/g, "").length < 7) return setError("Please add a valid phone number.");

    setBusy(true);
    try {
      const res = await api<{ token: string; customerId?: number; alreadyInQueue?: boolean }>(
        `/api/public/${slug}/queue`,
        { body: { name: name.trim(), phone: phone.trim(), serviceId, staffId } },
      );
      writeProfile(slug, {
        name: name.trim(),
        phone: phone.trim(),
        ticket: res.token,
        customerId: res.customerId,
      });

      if (res.customerId && (notify || offers)) {
        // Requests permission AND registers a real push subscription, so the
        // customer gets alerted even after closing the page.
        const push = await ensurePushSubscription(slug, res.customerId, {
          queueOptIn: notify,
          bookingOptIn: notify,
          marketingOptIn: offers,
        });
        if (!push.ok && push.status !== "dismissed") toast(push.message, "err");
      }

      if (res.alreadyInQueue) toast("You're already in the queue — here's your ticket.");
      router.push(`/s/${slug}/q/${res.token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  };

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
          <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.025em]">Join the live queue</h1>
          <p className="mt-1.5 text-[13.5px] text-muted">
            Takes about 20 seconds. We&apos;ll hold your place and keep you updated.
          </p>
        </div>

        {blocked ? (
          <div className="mt-5 rounded-xl border border-[#ecdcb8] bg-amber-soft px-4 py-3.5">
            <p className="text-[13.5px] font-semibold text-amber">{blocked}</p>
            <p className="mt-1 text-[13px] text-ink-2">
              You can still book an appointment for a time that suits you.
            </p>
            <Link href={`/s/${slug}/book`} className="btn btn-primary btn-sm mt-3">
              Book for later
            </Link>
          </div>
        ) : null}

        <section className="mt-6">
          <p className="lbl">1 · Choose a service</p>
          <div className="space-y-1.5">
            {data.services.map((s) => (
              <button
                key={s.id}
                onClick={() => setServiceId(s.id)}
                className={cx(
                  "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all",
                  serviceId === s.id
                    ? "border-transparent bg-surface shadow-[0_0_0_2px_var(--brand)]"
                    : "border-line bg-surface hover:border-line-2",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-medium leading-tight">{s.name}</span>
                  <span className="num mt-0.5 block text-[12.5px] text-muted">{s.durationMin} min</span>
                </span>
                <span className="num text-[14px] font-semibold">
                  {data.salon.currency === "INR" ? "₹" : ""}
                  {s.price}
                </span>
                {serviceId === s.id ? (
                  <span
                    className="grid h-5 w-5 place-items-center rounded-full text-white"
                    style={{ background: "var(--brand)" }}
                  >
                    <IconCheck width={12} height={12} />
                  </span>
                ) : (
                  <span className="h-5 w-5 rounded-full border border-line-2" />
                )}
              </button>
            ))}
          </div>
        </section>

        {data.staff.length > 0 ? (
          <section className="mt-7">
            <p className="lbl">2 · Preferred barber</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setStaffId(null)}
                className={cx(
                  "rounded-lg border px-3 py-2 text-[13.5px] font-medium transition-all",
                  staffId === null
                    ? "border-transparent bg-ink text-white"
                    : "border-line bg-surface text-ink-2 hover:border-line-2",
                )}
              >
                Anyone free
              </button>
              {data.staff
                .filter((m) => m.onShift)
                .map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setStaffId(m.id)}
                    className={cx(
                      "rounded-lg border px-3 py-2 text-[13.5px] font-medium transition-all",
                      staffId === m.id
                        ? "border-transparent bg-ink text-white"
                        : "border-line bg-surface text-ink-2 hover:border-line-2",
                    )}
                  >
                    {m.name}
                  </button>
                ))}
            </div>
            <p className="mt-2 text-[12.5px] text-muted">
              Picking a specific barber can mean a slightly longer wait.
            </p>
          </section>
        ) : null}

        <section className="mt-7">
          <p className="lbl">3 · Your details</p>
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
                <span className="font-medium">Tell me when my turn is close</span>
                <span className="block text-muted">Queue updates and booking reminders only.</span>
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
                <span className="block text-muted">Occasional discounts. Separate from queue alerts.</span>
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
            {service && eta ? (
              <>
                <p className="truncate text-[13px] font-medium">
                  {service.name} · {service.durationMin} min
                </p>
                <p className="num text-[12px] text-muted">
                  Est. turn around {eta.label} ({humanDuration(eta.mins)} wait)
                </p>
              </>
            ) : (
              <p className="flex items-center gap-1.5 text-[13px] text-muted">
                <IconScissors width={14} height={14} />
                Choose a service to see your estimated turn
              </p>
            )}
          </div>
          <button className="btn btn-brand btn-lg" onClick={submit} disabled={busy || Boolean(blocked)}>
            {busy ? <Spinner /> : null}
            {busy ? "Joining…" : "Join queue"}
          </button>
        </div>
      </div>
    </>
  );
}
