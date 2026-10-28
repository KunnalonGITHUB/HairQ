"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SalonTopBar } from "@/components/customer/chrome";
import { IconCheck, IconMapPin, IconPhone } from "@/components/icons";
import { api, cx, Modal, Spinner, toast } from "@/components/ui";
import { formatSalonDate, formatSalonTime } from "@/lib/salon-time";

type Payload = {
  booking: {
    token: string;
    scheduledAt: string;
    durationMin: number;
    status: string;
    serviceName: string;
    servicePrice: number;
    customerName: string;
    staffName: string | null;
    notes: string | null;
  };
  salon: {
    name: string;
    slug: string;
    phone: string | null;
    whatsapp: string | null;
    address: string | null;
    mapsUrl: string | null;
    logoUrl: string | null;
  };
};

export function BookingConfirmation({ slug, token }: { slug: string; token: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(`/api/public/${slug}/book/${token}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "We couldn't find that appointment.");
      setData(json as Payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't find that appointment.");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, token]);

  if (error) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-[19px] font-semibold">{error}</h1>
        <Link href={`/s/${slug}`} className="btn btn-quiet mt-5">
          Back to the salon
        </Link>
      </main>
    );
  }
  if (!data) {
    return <div className="mx-auto max-w-xl px-4 py-20 text-center text-sm text-muted">Loading…</div>;
  }

  const when = new Date(data.booking.scheduledAt);
  const cancelled = data.booking.status === "cancelled";

  const cancel = async () => {
    setBusy(true);
    try {
      await api(`/api/public/${slug}/book/${token}`, { method: "DELETE" });
      toast("Appointment cancelled.");
      setShowCancel(false);
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't cancel.", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SalonTopBar
        slug={slug}
        name={data.salon.name}
        logoUrl={data.salon.logoUrl}
        back={{ href: `/s/${slug}`, label: "Salon" }}
      />
      <main className="mx-auto max-w-xl px-4 pb-12">
        <section className="rise mt-6 text-center">
          <div
            className="mx-auto grid h-12 w-12 place-items-center rounded-2xl text-white"
            style={{ background: cancelled ? "#a2988e" : "var(--brand)" }}
          >
            <IconCheck width={22} height={22} />
          </div>
          <h1 className="mt-4 text-[23px] font-semibold tracking-[-0.025em]">
            {cancelled ? "Appointment cancelled" : "Your appointment is booked"}
          </h1>
          <p className="mt-1.5 text-[13.5px] text-muted">
            {cancelled
              ? "This slot has been released. You can book a new time whenever you like."
              : `We've saved your chair at ${data.salon.name}.`}
          </p>
        </section>

        <section className={cx("mt-6 overflow-hidden rounded-2xl border border-line bg-surface", cancelled && "opacity-60")}>
          <div className="border-b border-line bg-paper-2 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">When</p>
            <p className="mt-1 text-[19px] font-semibold tracking-[-0.02em]">
              {formatSalonDate(when, { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <p className="num text-[15px] text-ink-2">
              {formatSalonTime(when)} ·{" "}
              {data.booking.durationMin} min
            </p>
          </div>
          <Line label="Service" value={data.booking.serviceName} />
          <Line label="Barber" value={data.booking.staffName ?? "First one free"} />
          <Line label="Name" value={data.booking.customerName} />
          <Line label="Price" value={`₹${data.booking.servicePrice}`} last />
        </section>

        {!cancelled ? (
          <>
            <section className="mt-4 grid grid-cols-2 gap-2">
              {data.salon.mapsUrl ? (
                <a href={data.salon.mapsUrl} target="_blank" rel="noreferrer" className="btn btn-quiet">
                  <IconMapPin width={15} height={15} />
                  Directions
                </a>
              ) : null}
              {data.salon.phone ? (
                <a href={`tel:${data.salon.phone}`} className="btn btn-quiet">
                  <IconPhone width={15} height={15} />
                  Call salon
                </a>
              ) : null}
            </section>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
              <p className="text-[13px] text-muted">Plans changed?</p>
              <button className="btn btn-ghost btn-sm text-rose" onClick={() => setShowCancel(true)}>
                Cancel appointment
              </button>
            </div>
          </>
        ) : (
          <Link href={`/s/${slug}/book`} className="btn btn-brand mt-5 w-full">
            Book a new time
          </Link>
        )}

        <p className="mt-5 text-center text-[12px] leading-relaxed text-faint">
          Running late? Call the salon — we usually hold the chair for 10 minutes.
        </p>
      </main>

      <Modal
        open={showCancel}
        onClose={() => setShowCancel(false)}
        title="Cancel this appointment?"
        footer={
          <>
            <button className="btn btn-quiet" onClick={() => setShowCancel(false)}>
              Keep it
            </button>
            <button className="btn btn-danger" onClick={cancel} disabled={busy}>
              {busy ? <Spinner /> : null} Cancel appointment
            </button>
          </>
        }
      >
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          Your {formatSalonTime(when)} slot on{" "}
          {formatSalonDate(when, { weekday: "long" })} will be released for other customers.
        </p>
      </Modal>
    </>
  );
}

function Line({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={cx("flex items-center justify-between px-5 py-3 text-[13.5px]", !last && "border-b border-line")}>
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
