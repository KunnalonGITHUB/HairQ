"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHead, Panel, StatTile } from "@/components/owner/shell";
import { IconBell, IconMegaphone, IconSpark } from "@/components/icons";
import { api, Avatar, cx, EmptyState, Labeled, Spinner, toast } from "@/components/ui";
import { NotificationCard, NotificationStage } from "@/components/notification-card";
import { sinceLabel } from "@/lib/time";

/* ------------------------------------------------------------- audience */

type Row = {
  id: number;
  name: string;
  phone: string;
  totalVisits: number;
  totalSpend: number;
  lastVisitAt: string | null;
  lastActivityAt: string | null;
  pwaInstalled: boolean;
  subscribed: boolean;
  marketingOptIn: boolean | null;
  lastServiceName: string | null;
  daysSinceVisit: number | null;
};

const SEGMENTS = [
  { key: "all", label: "All customers", hint: "Everyone in your salon database" },
  { key: "notifications", label: "Notifications on", hint: "Can receive queue + booking pushes" },
  { key: "marketing", label: "Opted in to offers", hint: "Allowed to receive promotions" },
  { key: "pwa", label: "App installed", hint: "Added your salon to their phone" },
  { key: "recent", label: "Recent visitors", hint: "Came in within 30 days" },
  { key: "frequent", label: "Frequent customers", hint: "4 or more visits" },
  { key: "inactive", label: "Going cold", hint: "Not seen for 45+ days" },
];

export function AudienceView() {
  const [segment, setSegment] = useState("notifications");
  const [data, setData] = useState<{ customers: Row[]; segments: Record<string, number> } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/owner/customers?segment=${segment}&sort=recent`, { cache: "no-store" });
    setData(await res.json());
  }, [segment]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHead
        title="Audience"
        subtitle="The customers you can actually reach — and how they use your salon app."
        actions={
          <Link href={`/dashboard/notifications?segment=${segment}`} className="btn btn-primary">
            <IconMegaphone width={15} height={15} />
            Send notification
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatTile label="Reachable" value={data?.segments.notifications ?? "—"} sub="Push enabled" accent="pine" />
        <StatTile label="Offers opted in" value={data?.segments.marketing ?? "—"} sub="Marketing consent" accent="clay" />
        <StatTile label="App installed" value={data?.segments.pwa ?? "—"} sub="Salon PWA on home screen" />
        <StatTile label="Going cold" value={data?.segments.inactive ?? "—"} sub="45+ days since visit" accent="amber" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="space-y-1.5">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSegment(s.key)}
              className={cx(
                "w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors",
                segment === s.key
                  ? "border-transparent bg-ink text-white"
                  : "border-line bg-surface hover:border-line-2",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-medium">{s.label}</span>
                <span className={cx("num text-[12.5px]", segment === s.key ? "text-white/70" : "text-faint")}>
                  {data?.segments[s.key] ?? "—"}
                </span>
              </span>
              <span className={cx("mt-0.5 block text-[11.5px]", segment === s.key ? "text-white/55" : "text-muted")}>
                {s.hint}
              </span>
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {!data ? (
            <div className="h-64 animate-pulse bg-line/30" />
          ) : data.customers.length === 0 ? (
            <EmptyState
              title="Nobody in this segment yet"
              hint="Customers land here as they join the queue, book online or turn on notifications from your salon page."
              icon={<IconBell width={18} height={18} />}
            />
          ) : (
            data.customers.map((c, i) => (
              <Link
                key={c.id}
                href={`/dashboard/customers/${c.id}`}
                className={cx(
                  "flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 transition-colors hover:bg-paper-2",
                  i > 0 && "border-t border-line",
                )}
              >
                <Avatar name={c.name} size={32} />
                <div className="min-w-[120px] flex-1">
                  <p className="truncate text-[13.5px] font-medium leading-tight">{c.name}</p>
                  <p className="num truncate text-[12px] text-muted">{c.phone}</p>
                </div>
                <div className="text-[12.5px] text-muted">
                  <span className="num">{c.totalVisits}</span> visits
                </div>
                <div className="w-[110px] text-[12.5px] text-muted">
                  {c.lastVisitAt ? sinceLabel(new Date(c.lastVisitAt)) : "never visited"}
                </div>
                <div className="flex gap-1">
                  {c.subscribed ? <span className="chip chip-serving">Push</span> : null}
                  {c.marketingOptIn ? <span className="chip chip-info">Offers</span> : null}
                  {c.pwaInstalled ? <span className="chip chip-done">App</span> : null}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}

/* --------------------------------------------------------- notifications */

type Campaign = {
  id: number;
  title: string;
  body: string;
  segment: string;
  status: string;
  audienceCount: number;
  sentAt: string | null;
  scheduledFor: string | null;
  createdAt: string;
};

type CampaignPayload = {
  campaigns: Campaign[];
  audience: { all_opted_in: number; frequent: number; lapsed: number };
  delivery: { total: number; marketing: number; transactional: number; opened: number };
};

const AUDIENCES = [
  { value: "all_opted_in", label: "All opted-in customers" },
  { value: "frequent", label: "Frequent customers (4+ visits)" },
  { value: "lapsed", label: "Haven't visited in 45 days" },
  { value: "service", label: "Used a specific service" },
];

export function NotificationsComposer({
  salonName,
  salonSlug,
  salonLogoUrl,
}: {
  salonName: string;
  salonSlug?: string;
  salonLogoUrl?: string | null;
}) {
  const search = useSearchParams();
  const [data, setData] = useState<CampaignPayload | null>(null);
  const [services, setServices] = useState<{ id: number; name: string }[]>([]);
  const [title, setTitle] = useState("Weekend Special ✂️");
  const [body, setBody] = useState("Haircut + Beard for ₹399 this Sunday. Walk in or book your slot.");
  const [segment, setSegment] = useState("all_opted_in");
  const [serviceId, setServiceId] = useState<number | "">("");
  const [ctaLabel, setCtaLabel] = useState("Book now");
  const [expiresAt, setExpiresAt] = useState("");
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [scheduledFor, setScheduledFor] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/owner/campaigns", { cache: "no-store" });
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
    fetch("/api/owner/services", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { services: { id: number; name: string }[] }) => setServices(d.services))
      .catch(() => undefined);
    const preset = search.get("segment");
    if (preset === "frequent" || preset === "inactive") {
      setSegment(preset === "inactive" ? "lapsed" : "frequent");
    }
  }, [load, search]);

  const reach =
    segment === "frequent"
      ? data?.audience.frequent
      : segment === "lapsed"
        ? data?.audience.lapsed
        : data?.audience.all_opted_in;

  const send = async () => {
    setBusy(true);
    try {
      const res = await api<{ recipients: number; scheduled?: boolean }>("/api/owner/campaigns", {
        body: {
          title,
          body,
          segment,
          serviceId: serviceId || null,
          ctaLabel,
          expiresAt: expiresAt || null,
          mode,
          scheduledFor: scheduledFor || null,
        },
      });
      toast(
        res.scheduled
          ? `Scheduled for ${res.recipients} customers.`
          : `Sent to ${res.recipients} customer${res.recipients === 1 ? "" : "s"}.`,
      );
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't send.", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        title="Notifications"
        subtitle="Promotions go only to customers who opted in. Queue and booking alerts are sent automatically."
      />

      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <Panel title="Compose">
          <div className="space-y-3.5">
            <Labeled label="Title">
              <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
            </Labeled>
            <Labeled label="Message" hint={`${body.length}/180 characters`}>
              <textarea
                className="field min-h-[84px]"
                value={body}
                maxLength={180}
                onChange={(e) => setBody(e.target.value)}
              />
            </Labeled>
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="Audience">
                <select className="field" value={segment} onChange={(e) => setSegment(e.target.value)}>
                  {AUDIENCES.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </Labeled>
              {segment === "service" ? (
                <Labeled label="Service used">
                  <select
                    className="field"
                    value={serviceId}
                    onChange={(e) => setServiceId(e.target.value ? Number(e.target.value) : "")}
                  >
                    <option value="">Choose a service</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Labeled>
              ) : (
                <Labeled label="Button label">
                  <input className="field" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} />
                </Labeled>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="Offer expires" hint="Optional — shown on the customer side.">
                <input
                  type="date"
                  className="field"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </Labeled>
              <Labeled label="Delivery">
                <select
                  className="field"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as "now" | "schedule")}
                >
                  <option value="now">Send now</option>
                  <option value="schedule">Schedule for later</option>
                </select>
              </Labeled>
            </div>
            {mode === "schedule" ? (
              <Labeled label="Send at">
                <input
                  type="datetime-local"
                  className="field"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                />
              </Labeled>
            ) : null}

            <div className="flex items-center justify-between border-t border-line pt-3.5">
              <p className="text-[12.5px] text-muted">
                Reaching <span className="num font-semibold text-ink">{reach ?? 0}</span> opted-in customers
              </p>
              <button className="btn btn-primary" onClick={send} disabled={busy}>
                {busy ? <Spinner /> : <IconMegaphone width={15} height={15} />}
                {mode === "schedule" ? "Schedule" : "Send now"}
              </button>
            </div>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel
            title="Preview"
            action={<span className="text-[11.5px] text-muted">As your customer sees it</span>}
          >
            <NotificationStage>
              <NotificationCard
                salonName={salonName}
                logoUrl={salonLogoUrl}
                iconUrl={salonSlug ? `/s/${salonSlug}/icon.svg` : null}
                title={title || "Your title"}
                body={body || "Your message"}
                kind="marketing"
                time={new Date()}
              />
            </NotificationStage>
            <p className="mt-3 flex items-start gap-2 text-[12px] leading-snug text-muted">
              <IconSpark width={14} height={14} className="mt-0.5 shrink-0 text-clay" />
              Sent under your salon&apos;s own name and logo — never HairQ. Start a new line to add a
              second, softer supporting line.
            </p>
          </Panel>

          <Panel title="Delivery so far">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="num text-[19px] font-semibold leading-none">{data?.delivery.total ?? 0}</p>
                <p className="mt-1 text-[11.5px] text-muted">Sent</p>
              </div>
              <div>
                <p className="num text-[19px] font-semibold leading-none text-clay">
                  {data?.delivery.marketing ?? 0}
                </p>
                <p className="mt-1 text-[11.5px] text-muted">Marketing</p>
              </div>
              <div>
                <p className="num text-[19px] font-semibold leading-none text-pine">
                  {data?.delivery.transactional ?? 0}
                </p>
                <p className="mt-1 text-[11.5px] text-muted">Queue &amp; booking</p>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <h2 className="mb-2.5 mt-6 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">History</h2>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {!data || data.campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns sent yet"
            hint="Your first promotion could be a quiet-Tuesday offer to customers who haven't visited in a while."
            icon={<IconMegaphone width={18} height={18} />}
          />
        ) : (
          data.campaigns.map((c, i) => (
            <div key={c.id} className={cx("flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3", i > 0 && "border-t border-line")}>
              <div className="min-w-[180px] flex-1">
                <p className="text-[13.5px] font-medium leading-tight">{c.title}</p>
                <p className="truncate text-[12px] text-muted">{c.body}</p>
              </div>
              <span className="chip chip-done">{c.segment.replace(/_/g, " ")}</span>
              <span className="num text-[12.5px] text-muted">{c.audienceCount} recipients</span>
              <span className="text-[12px] text-faint">
                {c.sentAt
                  ? sinceLabel(new Date(c.sentAt))
                  : c.scheduledFor
                    ? `scheduled ${new Date(c.scheduledFor).toLocaleString("en-US", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}`
                    : "draft"}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
