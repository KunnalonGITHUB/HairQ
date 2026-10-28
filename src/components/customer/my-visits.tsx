"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SalonTopBar } from "@/components/customer/chrome";
import { IconBell, IconChevronRight } from "@/components/icons";
import { api, cx, EmptyState, Spinner, toast } from "@/components/ui";
import { NotificationCard } from "@/components/notification-card";
import { readProfile, writeProfile } from "@/lib/local-identity";
import { ensurePushSubscription } from "@/lib/push-client";
import { sinceLabel } from "@/lib/time";
import { formatSalonDate, formatSalonTime } from "@/lib/salon-time";

type Lookup = {
  customer: {
    id: number;
    name: string;
    phone: string;
    totalVisits: number;
    loyaltyPoints: number;
    lastVisitAt: string | null;
  };
  visits: { id: number; completedAt: string; amount: number; serviceName: string; staffName: string | null }[];
  upcoming: { token: string; scheduledAt: string; serviceName: string; staffName: string | null }[];
  activeQueue: { token: string; status: string } | null;
  subscription: {
    queueOptIn: boolean;
    bookingOptIn: boolean;
    marketingOptIn: boolean;
  } | null;
};

type Feed = {
  notifications: { id: number; title: string; body: string; type: string; deliveredAt: string; readAt: string | null }[];
  unread: number;
};

export function MyVisits({
  slug,
  salonName,
  salonLogoUrl,
}: {
  slug: string;
  salonName: string;
  salonLogoUrl?: string | null;
}) {
  const [phone, setPhone] = useState("");
  const [data, setData] = useState<Lookup | null>(null);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(
    async (value: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await api<Lookup>(`/api/public/${slug}/lookup`, { body: { phone: value } });
        setData(res);
        writeProfile(slug, { phone: value, name: res.customer.name, customerId: res.customer.id });
        const f = await fetch(`/api/public/${slug}/notify?customerId=${res.customer.id}`, {
          cache: "no-store",
        });
        setFeed((await f.json()) as Feed);
        await api(`/api/public/${slug}/notify`, {
          body: { action: "mark_read", customerId: res.customer.id },
        }).catch(() => undefined);
      } catch (err) {
        setData(null);
        setError(err instanceof Error ? err.message : "We couldn't find that number.");
      } finally {
        setBusy(false);
      }
    },
    [slug],
  );

  useEffect(() => {
    const profile = readProfile(slug);
    if (profile.phone) {
      setPhone(profile.phone);
      lookup(profile.phone);
    }
  }, [slug, lookup]);

  const updatePrefs = async (patch: Record<string, boolean>) => {
    if (!data) return;
    const next = {
      queueOptIn: data.subscription?.queueOptIn ?? true,
      bookingOptIn: data.subscription?.bookingOptIn ?? true,
      marketingOptIn: data.subscription?.marketingOptIn ?? false,
      ...patch,
    };
    setData({ ...data, subscription: { ...next } });

    // Handles permission, service worker and the actual PushSubscription,
    // then persists preferences in one place.
    const push = await ensurePushSubscription(slug, data.customer.id, next);
    if (push.ok) {
      toast("Notification preferences saved.");
    } else if (push.status === "dismissed") {
      toast("Preferences saved. Alerts stay off until you allow notifications.");
    } else {
      toast(push.message, "err");
    }
  };

  return (
    <>
      <SalonTopBar slug={slug} name={salonName} back={{ href: `/s/${slug}`, label: "Salon" }} />
      <main className="mx-auto max-w-xl px-4 pb-16">
        <h1 className="pt-6 text-[23px] font-semibold tracking-[-0.025em]">Your visits</h1>
        <p className="mt-1.5 text-[13.5px] text-muted">
          Enter the number you use at {salonName} to see bookings, history and updates.
        </p>

        <div className="mt-4 flex gap-2">
          <input
            className="field flex-1"
            placeholder="Phone number"
            value={phone}
            inputMode="tel"
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup(phone)}
          />
          <button className="btn btn-primary" onClick={() => lookup(phone)} disabled={busy || !phone}>
            {busy ? <Spinner /> : null} Find
          </button>
        </div>

        {error ? (
          <div className="mt-5 rounded-xl border border-line bg-surface px-4 py-5 text-center">
            <p className="text-[14px] font-medium">{error}</p>
            <p className="mt-1 text-[13px] text-muted">
              Join the live queue or book once and your history will show up here.
            </p>
            <Link href={`/s/${slug}`} className="btn btn-quiet btn-sm mt-3">
              Go to salon
            </Link>
          </div>
        ) : null}

        {data ? (
          <>
            <section className="mt-6 rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[16px] font-semibold tracking-[-0.01em]">{data.customer.name}</p>
                  <p className="num text-[13px] text-muted">{data.customer.phone}</p>
                </div>
                <div className="text-right">
                  <p className="num text-[20px] font-semibold leading-none">{data.customer.totalVisits}</p>
                  <p className="text-[11.5px] text-muted">visits</p>
                </div>
              </div>
              {data.customer.lastVisitAt ? (
                <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-muted">
                  Last visit {sinceLabel(new Date(data.customer.lastVisitAt))} ·{" "}
                  <span className="num">{data.customer.loyaltyPoints}</span> points earned
                </p>
              ) : null}
            </section>

            {data.activeQueue ? (
              <Link
                href={`/s/${slug}/q/${data.activeQueue.token}`}
                className="mt-3 flex items-center gap-3 rounded-xl border px-4 py-3"
                style={{ background: "var(--brand-soft)", borderColor: "var(--brand-line)" }}
              >
                <span className="live-dot h-2 w-2 rounded-full" style={{ background: "var(--brand)" }} />
                <span className="flex-1 text-[13.5px] font-medium" style={{ color: "var(--brand)" }}>
                  You&apos;re in the live queue right now
                </span>
                <IconChevronRight width={16} height={16} className="text-muted" />
              </Link>
            ) : null}

            {data.upcoming.length > 0 ? (
              <section className="mt-6">
                <h2 className="lbl">Upcoming</h2>
                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  {data.upcoming.map((b, i) => (
                    <Link
                      key={b.token}
                      href={`/s/${slug}/b/${b.token}`}
                      className={cx("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-line")}
                    >
                      <div className="flex-1">
                        <p className="text-[14px] font-medium">
                          {formatSalonDate(new Date(b.scheduledAt), {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                          {" · "}
                          {formatSalonTime(new Date(b.scheduledAt))}
                        </p>
                        <p className="text-[12.5px] text-muted">
                          {b.serviceName}
                          {b.staffName ? ` · ${b.staffName}` : ""}
                        </p>
                      </div>
                      <IconChevronRight width={15} height={15} className="text-faint" />
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="mt-6">
              <h2 className="lbl">Notifications</h2>
              <div className="space-y-2.5 rounded-xl border border-line bg-surface p-4">
                <Toggle
                  label="Queue updates"
                  hint="When your turn is close."
                  checked={data.subscription?.queueOptIn ?? false}
                  onChange={(v) => updatePrefs({ queueOptIn: v })}
                />
                <Toggle
                  label="Booking reminders"
                  hint="Confirmations and changes."
                  checked={data.subscription?.bookingOptIn ?? false}
                  onChange={(v) => updatePrefs({ bookingOptIn: v })}
                />
                <Toggle
                  label="Offers from the salon"
                  hint="Occasional discounts. Never spam."
                  checked={data.subscription?.marketingOptIn ?? false}
                  onChange={(v) => updatePrefs({ marketingOptIn: v })}
                />
              </div>
            </section>

            {feed && feed.notifications.length > 0 ? (
              <section className="mt-6">
                <h2 className="lbl">Recent updates</h2>
                <div className="space-y-2">
                  {feed.notifications.map((n) => (
                    <NotificationCard
                      key={n.id}
                      salonName={salonName}
                      logoUrl={salonLogoUrl}
                      iconUrl={`/s/${slug}/icon.svg`}
                      title={n.title}
                      body={n.body}
                      kind={
                        n.type === "marketing" ? "marketing" : n.type === "booking" ? "booking" : "queue"
                      }
                      time={n.deliveredAt}
                      showChevron={false}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="mt-6">
              <h2 className="lbl">Visit history</h2>
              {data.visits.length === 0 ? (
                <div className="rounded-xl border border-line bg-surface">
                  <EmptyState
                    title="No visits recorded yet"
                    hint="Your past services will appear here after your first visit."
                    icon={<IconBell width={18} height={18} />}
                  />
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  {data.visits.map((v, i) => (
                    <div
                      key={v.id}
                      className={cx("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-line")}
                    >
                      <div className="flex-1">
                        <p className="text-[14px] font-medium">{v.serviceName}</p>
                        <p className="text-[12.5px] text-muted">
                          {new Date(v.completedAt).toLocaleDateString("en-US", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                          {v.staffName ? ` · ${v.staffName}` : ""}
                        </p>
                      </div>
                      <span className="num text-[13.5px] font-medium">₹{v.amount}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <span className="flex-1">
        <span className="block text-[13.5px] font-medium">{label}</span>
        <span className="block text-[12.5px] text-muted">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors",
          checked ? "" : "bg-line-2",
        )}
        style={checked ? { background: "var(--brand)" } : undefined}
      >
        <span
          className={cx(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </button>
    </label>
  );
}
