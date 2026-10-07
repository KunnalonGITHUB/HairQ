"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SalonTopBar } from "@/components/customer/chrome";
import { IconCheck, IconMapPin, IconPhone, IconScissors } from "@/components/icons";
import { api, cx, Modal, Spinner, toast, usePoll } from "@/components/ui";
import { peek } from "@/components/customer/notification-peek";
import { clearTicket, readProfile } from "@/lib/local-identity";
import { stageCopy } from "@/lib/queue-engine";
import type { PublicState, TicketState } from "@/lib/public-types";

const STAGE_COPY: Record<string, { head: string; tone: string }> = {
  waiting: { head: "You're in the queue", tone: "text-muted" },
  soon: { head: "Your turn is getting closer", tone: "text-amber" },
  next: { head: "You're next — head over now", tone: "text-pine" },
  serving: { head: "You're in the chair", tone: "text-pine" },
};

export function TicketScreen({ slug, token }: { slug: string; token: string }) {
  const router = useRouter();
  const { data, error, refresh } = usePoll<TicketState>(`/api/public/${slug}/queue/${token}`, 5000);
  const [leaving, setLeaving] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  const [showChange, setShowChange] = useState(false);
  const [services, setServices] = useState<PublicState["services"]>([]);
  const lastStage = useRef<string | null>(null);
  const lastAhead = useRef<number | null>(null);

  useEffect(() => {
    fetch(`/api/public/${slug}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: PublicState) => setServices(d.services))
      .catch(() => undefined);
  }, [slug]);

  // Local notification when the customer's stage advances.
  useEffect(() => {
    const entry = data?.entry;
    if (!entry) return;
    const stage = entry.stage;
    if (lastStage.current && lastStage.current !== stage && stage !== "waiting") {
      const copy = stageCopy(stage, data.salon.name, entry.ahead, entry.waitMin);
      // In-app presentation mirrors the native notification design.
      peek({
        salonName: data.salon.name,
        logoUrl: data.salon.logoUrl,
        iconUrl: `/s/${slug}/icon.svg`,
        title: copy.title,
        body: copy.body,
        kind: "queue",
      });
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(copy.title, {
            body: copy.body,
            icon: data.salon.logoUrl || `/s/${slug}/icon.svg`,
            badge: `/s/${slug}/icon.svg`,
            tag: `hairq-${token}`,
          });
        } catch {
          /* notifications unsupported */
        }
      }
    }
    lastStage.current = stage;
    lastAhead.current = entry.ahead;
  }, [data, slug, token]);

  const leave = async () => {
    setLeaving(true);
    try {
      await api(`/api/public/${slug}/queue/${token}`, { method: "DELETE" });
      clearTicket(slug);
      toast("You've left the queue.");
      router.push(`/s/${slug}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't leave the queue.", "err");
      setLeaving(false);
      setShowLeave(false);
    }
  };

  const changeService = async (serviceId: number) => {
    try {
      await api(`/api/public/${slug}/queue/${token}`, { method: "PATCH", body: { serviceId } });
      toast("Service updated — your estimate has been recalculated.");
      setShowChange(false);
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't change the service.", "err");
    }
  };

  if (!data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center text-sm text-muted">
        {error ?? "Loading your ticket…"}
      </div>
    );
  }

  if (!data.active || !data.entry) {
    const done = data.status === "completed";
    return (
      <>
        <SalonTopBar slug={slug} name={data.salon.name} back={{ href: `/s/${slug}`, label: "Back" }} />
        <main className="mx-auto max-w-xl px-4 py-16 text-center">
          <div
            className="mx-auto grid h-12 w-12 place-items-center rounded-2xl"
            style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
          >
            <IconCheck width={22} height={22} />
          </div>
          <h1 className="mt-4 text-[21px] font-semibold tracking-[-0.02em]">
            {done ? "Thanks for coming in" : "You're no longer in the queue"}
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-[14px] leading-relaxed text-muted">
            {done
              ? `We hope you liked the ${data.serviceName?.toLowerCase() ?? "service"}. Book your next visit in a tap.`
              : "Your place was released. You can join again whenever you're ready."}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link href={`/s/${slug}/book`} className="btn btn-brand">
              Book next visit
            </Link>
            <Link href={`/s/${slug}`} className="btn btn-quiet">
              Salon home
            </Link>
          </div>
        </main>
      </>
    );
  }

  const entry = data.entry;
  const stage = STAGE_COPY[entry.stage] ?? STAGE_COPY.waiting;
  const serving = entry.status === "serving";
  const progress = Math.max(
    6,
    Math.min(100, ((entry.position === 0 ? 1 : 1 / (entry.position + 1)) * 100) | 0),
  );

  return (
    <>
      <SalonTopBar
        slug={slug}
        name={data.salon.name}
        logoUrl={data.salon.logoUrl}
        back={{ href: `/s/${slug}`, label: "Salon" }}
      />

      <main className="mx-auto max-w-xl px-4 pb-10">
        <section className="mt-5 overflow-hidden rounded-2xl bg-ink text-white">
          <div className="px-5 pb-5 pt-5">
            <p className={cx("text-[11px] font-semibold uppercase tracking-[0.12em]", "text-white/55")}>
              {stage.head}
            </p>

            {serving ? (
              <div className="mt-3.5">
                <p className="text-[30px] font-semibold leading-tight tracking-[-0.03em]">
                  It&apos;s your turn ✂️
                </p>
                <p className="mt-1.5 text-[13.5px] text-white/60">
                  {entry.staffName ? `${entry.staffName} is with you now.` : "Your barber is with you now."}
                </p>
              </div>
            ) : (
              <>
                <div className="mt-3 flex items-end gap-4">
                  <p className="num text-[56px] font-semibold leading-[0.9] tracking-[-0.045em]">
                    #{entry.position}
                  </p>
                  <div className="mb-1.5">
                    <p className="text-[14px] font-medium leading-tight">
                      {entry.ahead === 0
                        ? "You're next in line"
                        : `${entry.ahead} ${entry.ahead === 1 ? "customer" : "customers"} ahead`}
                    </p>
                    <p className="num mt-1 text-[12.5px] text-white/55">
                      Est. wait {entry.waitLabel}
                    </p>
                  </div>
                </div>

                <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${progress}%`, background: "var(--brand)" }}
                  />
                </div>

                <div className="mt-4 flex items-center justify-between rounded-xl bg-white/[0.05] px-3.5 py-3">
                  <span className="text-[12.5px] text-white/55">Estimated turn</span>
                  <span className="num text-[15px] font-semibold">Around {entry.turnLabel}</span>
                </div>
                <p className="mt-2 text-[11.5px] leading-snug text-white/40">
                  Estimates move with the chair — we&apos;ll update this automatically if things run early or late.
                </p>
              </>
            )}
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-line bg-surface">
          <Row label="Service" value={`${entry.serviceName} · ${entry.durationMin} min`} />
          <Row label="Barber" value={entry.staffName ?? "First one free"} />
          <Row label="Name" value={entry.customerName} />
          <Row
            label="Salon"
            value={
              data.queue?.status === "open"
                ? `Open · ${data.queue.chairCount} ${data.queue.chairCount === 1 ? "chair" : "chairs"} working`
                : "Queue paused"
            }
            last
          />
        </section>

        <section className="mt-4 grid grid-cols-2 gap-2">
          {data.salon.phone ? (
            <a href={`tel:${data.salon.phone}`} className="btn btn-quiet">
              <IconPhone width={15} height={15} />
              Call salon
            </a>
          ) : null}
          {data.salon.mapsUrl ? (
            <a href={data.salon.mapsUrl} target="_blank" rel="noreferrer" className="btn btn-quiet">
              <IconMapPin width={15} height={15} />
              Directions
            </a>
          ) : null}
          {!serving && data.salon.allowServiceChange ? (
            <button className="btn btn-quiet" onClick={() => setShowChange(true)}>
              <IconScissors width={15} height={15} />
              Change service
            </button>
          ) : null}
          {!serving ? (
            <button className="btn btn-danger" onClick={() => setShowLeave(true)}>
              Leave queue
            </button>
          ) : null}
        </section>

        <p className="mt-5 text-center text-[12px] text-faint">
          Keep this page open or{" "}
          <Link href={`/s/${slug}/me`} className="underline underline-offset-2">
            check your updates
          </Link>{" "}
          — your place is saved on this phone.
        </p>
      </main>

      <Modal
        open={showLeave}
        onClose={() => setShowLeave(false)}
        title="Leave the queue?"
        description="Your place will be given to the next customer."
        footer={
          <>
            <button className="btn btn-quiet" onClick={() => setShowLeave(false)}>
              Stay in queue
            </button>
            <button className="btn btn-danger" onClick={leave} disabled={leaving}>
              {leaving ? <Spinner /> : null} Leave queue
            </button>
          </>
        }
      >
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          You&apos;re currently #{entry.position} with an estimated turn around {entry.turnLabel}. If you rejoin
          later you&apos;ll start at the back of the line.
        </p>
      </Modal>

      <Modal
        open={showChange}
        onClose={() => setShowChange(false)}
        title="Change your service"
        description="Your estimated turn will be recalculated instantly."
      >
        <div className="space-y-1.5">
          {services.map((s) => (
            <button
              key={s.id}
              onClick={() => changeService(s.id)}
              className={cx(
                "flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left transition-colors",
                s.id === entry.serviceId ? "border-ink bg-paper-2" : "border-line hover:bg-paper-2",
              )}
            >
              <span>
                <span className="block text-[14px] font-medium">{s.name}</span>
                <span className="num block text-[12.5px] text-muted">{s.durationMin} min</span>
              </span>
              <span className="num text-[13.5px] font-semibold">₹{s.price}</span>
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={cx(
        "flex items-center justify-between px-4 py-3 text-[13.5px]",
        !last && "border-b border-line",
      )}
    >
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
