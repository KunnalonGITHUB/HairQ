"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageHead, Panel } from "@/components/owner/shell";
import { IconDownload, IconPlus, IconQr, IconShare, IconX } from "@/components/icons";
import { api, cx, Labeled, Segmented, Spinner, toast } from "@/components/ui";
import { DAY_NAMES } from "@/lib/time";

type Salon = {
  id: number;
  slug: string;
  name: string;
  tagline: string | null;
  about: string | null;
  logoUrl: string | null;
  brandColor: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  mapsUrl: string | null;
  instagram: string | null;
  pwaName: string | null;
  pwaShortName: string | null;
  pwaThemeColor: string | null;
  customDomain: string | null;
  websiteEnabled: boolean;
  queueStatus: string;
  maxQueueSize: number;
  acceptingBookings: boolean;
  bookingHorizonDays: number;
  slotIntervalMin: number;
  allowServiceChange: boolean;
};

type Hours = {
  dayOfWeek: number;
  isClosed: boolean;
  openTime: string;
  closeTime: string;
  breakStart: string | null;
  breakEnd: string | null;
};

type Offer = { id: number; title: string; description: string | null; badge: string | null; active: boolean };

type Tab = "profile" | "link" | "brand" | "hours" | "queue" | "offers";

export function SettingsView() {
  const [tab, setTab] = useState<Tab>("profile");
  const [salon, setSalon] = useState<Salon | null>(null);
  const [hours, setHours] = useState<Hours[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/owner/salon", { cache: "no-store" });
    const json = (await res.json()) as { salon: Salon; hours: Hours[]; offers: Offer[] };
    setSalon(json.salon);
    setHours(json.hours);
    setOffers(json.offers);
  }, []);

  useEffect(() => {
    load();
    setOrigin(window.location.origin);
  }, [load]);

  if (!salon) return <div className="h-80 animate-pulse rounded-xl bg-line/40" />;

  const patch = (changes: Partial<Salon>) => setSalon({ ...salon, ...changes });

  const save = async (section: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api("/api/owner/salon", { method: "PATCH", body: { section, ...body } });
      toast("Saved.");
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save.", "err");
    } finally {
      setBusy(false);
    }
  };

  const publicUrl = `${origin}/s/${salon.slug}`;

  return (
    <>
      <PageHead
        title="Salon settings"
        subtitle="Everything your customers see — under your own name, not ours."
        actions={
          <Link href={`/s/${salon.slug}`} target="_blank" className="btn btn-quiet">
            Preview salon page
          </Link>
        }
      />

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "profile", label: "Profile" },
          { value: "link", label: "Link & QR" },
          { value: "brand", label: "Branding & app" },
          { value: "hours", label: "Working hours" },
          { value: "queue", label: "Queue & booking" },
          { value: "offers", label: "Offers" },
        ]}
      />

      <div className="mt-4">
        {tab === "profile" ? (
          <Panel title="Salon profile">
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Labeled label="Salon name">
                  <input className="field" value={salon.name} onChange={(e) => patch({ name: e.target.value })} />
                </Labeled>
                <Labeled label="Tagline">
                  <input
                    className="field"
                    value={salon.tagline ?? ""}
                    onChange={(e) => patch({ tagline: e.target.value })}
                    placeholder="Walk in without the wait."
                  />
                </Labeled>
              </div>
              <Labeled label="About">
                <textarea
                  className="field min-h-[84px]"
                  value={salon.about ?? ""}
                  onChange={(e) => patch({ about: e.target.value })}
                />
              </Labeled>
              <div className="grid gap-3 sm:grid-cols-3">
                <Labeled label="Phone">
                  <input className="field" value={salon.phone ?? ""} onChange={(e) => patch({ phone: e.target.value })} />
                </Labeled>
                <Labeled label="WhatsApp">
                  <input
                    className="field"
                    value={salon.whatsapp ?? ""}
                    onChange={(e) => patch({ whatsapp: e.target.value })}
                  />
                </Labeled>
                <Labeled label="Email">
                  <input className="field" value={salon.email ?? ""} onChange={(e) => patch({ email: e.target.value })} />
                </Labeled>
              </div>
              <Labeled label="Address">
                <input className="field" value={salon.address ?? ""} onChange={(e) => patch({ address: e.target.value })} />
              </Labeled>
              <div className="grid gap-3 sm:grid-cols-2">
                <Labeled label="Google Maps link">
                  <input className="field" value={salon.mapsUrl ?? ""} onChange={(e) => patch({ mapsUrl: e.target.value })} />
                </Labeled>
                <Labeled label="Instagram">
                  <input
                    className="field"
                    value={salon.instagram ?? ""}
                    onChange={(e) => patch({ instagram: e.target.value })}
                  />
                </Labeled>
              </div>
              <div className="flex justify-end border-t border-line pt-3">
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() =>
                    save("profile", {
                      name: salon.name,
                      tagline: salon.tagline,
                      about: salon.about,
                      phone: salon.phone,
                      whatsapp: salon.whatsapp,
                      email: salon.email,
                      address: salon.address,
                      mapsUrl: salon.mapsUrl,
                      instagram: salon.instagram,
                    })
                  }
                >
                  {busy ? <Spinner /> : null} Save profile
                </button>
              </div>
            </div>
          </Panel>
        ) : null}

        {tab === "link" ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Panel title="Your customer link">
              <Labeled label="Link handle" hint="Printed on your QR code — keep it short and memorable.">
                <div className="flex items-center gap-1.5">
                  <span className="num shrink-0 rounded-lg border border-line bg-paper-2 px-2.5 py-2.5 text-[13px] text-muted">
                    /s/
                  </span>
                  <input className="field" value={salon.slug} onChange={(e) => patch({ slug: e.target.value })} />
                </div>
              </Labeled>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn btn-primary" disabled={busy} onClick={() => save("profile", { slug: salon.slug })}>
                  Save link
                </button>
                <button
                  className="btn btn-quiet"
                  onClick={() => {
                    navigator.clipboard?.writeText(publicUrl);
                    toast("Link copied — paste it into Instagram or WhatsApp.");
                  }}
                >
                  <IconShare width={15} height={15} />
                  Copy link
                </button>
              </div>
              <p className="num mt-3 break-all rounded-lg bg-paper-2 px-3 py-2.5 text-[12.5px] text-ink-2">
                {publicUrl}
              </p>

              <div className="mt-5 border-t border-line pt-4">
                <Labeled
                  label="Custom domain"
                  hint="Premium — point book.yoursalon.com at HairQ and customers never leave your brand."
                >
                  <input
                    className="field"
                    placeholder="book.yoursalon.com"
                    value={salon.customDomain ?? ""}
                    onChange={(e) => patch({ customDomain: e.target.value })}
                  />
                </Labeled>
                <div className="mt-3 flex items-center justify-between">
                  <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={salon.websiteEnabled}
                      onChange={(e) => patch({ websiteEnabled: e.target.checked })}
                      className="h-4 w-4 accent-[#bc5a2e]"
                    />
                    Enable the optional salon website add-on
                  </label>
                  <Link href={`/site/${salon.slug}`} target="_blank" className="btn btn-ghost btn-sm">
                    Preview website
                  </Link>
                </div>
                <button
                  className="btn btn-quiet btn-sm mt-3"
                  disabled={busy}
                  onClick={() =>
                    save("profile", { customDomain: salon.customDomain, websiteEnabled: salon.websiteEnabled })
                  }
                >
                  Save
                </button>
              </div>
            </Panel>

            <Panel title="QR code">
              <div className="rounded-xl border border-line bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/owner/qr?origin=${encodeURIComponent(origin)}`} alt="Salon QR code" className="w-full" />
              </div>
              <p className="mt-3 text-[12.5px] leading-snug text-muted">
                Stick it on the counter, the mirror, your door and your visiting card. Scanning opens your queue
                page instantly — no app needed.
              </p>
              <div className="mt-3 flex gap-2">
                <a className="btn btn-primary btn-sm flex-1" href={`/api/owner/qr?download=1&origin=${encodeURIComponent(origin)}`}>
                  <IconDownload width={14} height={14} />
                  Download
                </a>
                <button className="btn btn-quiet btn-sm flex-1" onClick={() => window.print()}>
                  <IconQr width={14} height={14} />
                  Print
                </button>
              </div>
            </Panel>
          </div>
        ) : null}

        {tab === "brand" ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <Panel title="Branding & installable app">
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Labeled label="Brand colour" hint="Used for buttons and highlights on your salon page.">
                    <div className="flex gap-2">
                      <input
                        type="color"
                        className="h-[42px] w-12 cursor-pointer rounded-lg border border-line-2 bg-surface p-1"
                        value={salon.brandColor}
                        onChange={(e) => patch({ brandColor: e.target.value })}
                      />
                      <input
                        className="field num"
                        value={salon.brandColor}
                        onChange={(e) => patch({ brandColor: e.target.value })}
                      />
                    </div>
                  </Labeled>
                  <Labeled label="Logo URL" hint="Square image works best.">
                    <input
                      className="field"
                      value={salon.logoUrl ?? ""}
                      onChange={(e) => patch({ logoUrl: e.target.value })}
                    />
                  </Labeled>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Labeled label="App name">
                    <input
                      className="field"
                      value={salon.pwaName ?? ""}
                      onChange={(e) => patch({ pwaName: e.target.value })}
                    />
                  </Labeled>
                  <Labeled label="Short name" hint="Under the icon.">
                    <input
                      className="field"
                      maxLength={12}
                      value={salon.pwaShortName ?? ""}
                      onChange={(e) => patch({ pwaShortName: e.target.value })}
                    />
                  </Labeled>
                  <Labeled label="Theme colour">
                    <input
                      className="field num"
                      value={salon.pwaThemeColor ?? salon.brandColor}
                      onChange={(e) => patch({ pwaThemeColor: e.target.value })}
                    />
                  </Labeled>
                </div>
                <div className="flex justify-end border-t border-line pt-3">
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() =>
                      save("brand", {
                        brandColor: salon.brandColor,
                        logoUrl: salon.logoUrl,
                        pwaName: salon.pwaName,
                        pwaShortName: salon.pwaShortName,
                        pwaThemeColor: salon.pwaThemeColor,
                      })
                    }
                  >
                    {busy ? <Spinner /> : null} Save branding
                  </button>
                </div>
              </div>
            </Panel>

            <Panel title="How it installs">
              <div className="rounded-2xl border border-line bg-paper-2 p-5 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/s/${salon.slug}/icon.svg`}
                  alt="App icon"
                  className="mx-auto h-16 w-16 rounded-2xl shadow-[0_6px_18px_-8px_rgba(25,20,17,.5)]"
                />
                <p className="mt-2.5 text-[12.5px] font-medium">{salon.pwaShortName || salon.name}</p>
              </div>
              <p className="mt-3 text-[12.5px] leading-snug text-muted">
                Customers see <span className="font-medium text-ink-2">{salon.pwaName || salon.name}</span> on
                their home screen. HairQ stays invisible.
              </p>
            </Panel>
          </div>
        ) : null}

        {tab === "hours" ? (
          <Panel title="Working hours">
            <div className="space-y-2">
              {hours.map((h, i) => (
                <div key={h.dayOfWeek} className="flex flex-wrap items-center gap-2.5 border-b border-line pb-2.5 last:border-0">
                  <span className="w-[86px] text-[13.5px] font-medium">{DAY_NAMES[h.dayOfWeek]}</span>
                  <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
                    <input
                      type="checkbox"
                      checked={!h.isClosed}
                      onChange={(e) => {
                        const next = [...hours];
                        next[i] = { ...h, isClosed: !e.target.checked };
                        setHours(next);
                      }}
                      className="h-4 w-4 accent-[#1f5048]"
                    />
                    Open
                  </label>
                  <input
                    type="time"
                    disabled={h.isClosed}
                    className="field w-[120px]"
                    value={h.openTime}
                    onChange={(e) => {
                      const next = [...hours];
                      next[i] = { ...h, openTime: e.target.value };
                      setHours(next);
                    }}
                  />
                  <span className="text-muted">–</span>
                  <input
                    type="time"
                    disabled={h.isClosed}
                    className="field w-[120px]"
                    value={h.closeTime}
                    onChange={(e) => {
                      const next = [...hours];
                      next[i] = { ...h, closeTime: e.target.value };
                      setHours(next);
                    }}
                  />
                  <span className="hidden text-[12px] text-faint sm:inline">Break</span>
                  <input
                    type="time"
                    disabled={h.isClosed}
                    className="field w-[120px]"
                    value={h.breakStart ?? ""}
                    onChange={(e) => {
                      const next = [...hours];
                      next[i] = { ...h, breakStart: e.target.value };
                      setHours(next);
                    }}
                  />
                  <input
                    type="time"
                    disabled={h.isClosed}
                    className="field w-[120px]"
                    value={h.breakEnd ?? ""}
                    onChange={(e) => {
                      const next = [...hours];
                      next[i] = { ...h, breakEnd: e.target.value };
                      setHours(next);
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button className="btn btn-primary" disabled={busy} onClick={() => save("hours", { hours })}>
                {busy ? <Spinner /> : null} Save hours
              </button>
            </div>
          </Panel>
        ) : null}

        {tab === "queue" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Live queue">
              <Labeled label="Queue status">
                <select
                  className="field"
                  value={salon.queueStatus}
                  onChange={(e) => patch({ queueStatus: e.target.value })}
                >
                  <option value="open">Open — accepting new customers</option>
                  <option value="paused">Paused — keep current queue, no new joins</option>
                  <option value="closed">Closed — bookings only</option>
                </select>
              </Labeled>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Labeled label="Maximum queue size">
                  <input
                    type="number"
                    className="field"
                    value={salon.maxQueueSize}
                    onChange={(e) => patch({ maxQueueSize: Number(e.target.value) })}
                  />
                </Labeled>
                <Labeled label="Customers can change service">
                  <select
                    className="field"
                    value={salon.allowServiceChange ? "yes" : "no"}
                    onChange={(e) => patch({ allowServiceChange: e.target.value === "yes" })}
                  >
                    <option value="yes">Allowed while waiting</option>
                    <option value="no">Only at the counter</option>
                  </select>
                </Labeled>
              </div>
              <button
                className="btn btn-primary mt-3.5"
                disabled={busy}
                onClick={() =>
                  save("queue", {
                    queueStatus: salon.queueStatus,
                    maxQueueSize: salon.maxQueueSize,
                    allowServiceChange: salon.allowServiceChange,
                  })
                }
              >
                Save queue settings
              </button>
            </Panel>

            <Panel title="Online booking">
              <label className="flex cursor-pointer items-center gap-2 text-[13.5px]">
                <input
                  type="checkbox"
                  checked={salon.acceptingBookings}
                  onChange={(e) => patch({ acceptingBookings: e.target.checked })}
                  className="h-4 w-4 accent-[#bc5a2e]"
                />
                Accept appointments online
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Labeled label="Book up to (days ahead)">
                  <input
                    type="number"
                    className="field"
                    value={salon.bookingHorizonDays}
                    onChange={(e) => patch({ bookingHorizonDays: Number(e.target.value) })}
                  />
                </Labeled>
                <Labeled label="Slot interval (minutes)">
                  {/* Slots are always generated every 30 minutes (see lib/availability). */}
                  <input type="number" className="field" value={30} disabled readOnly />
                </Labeled>
              </div>
              <button
                className="btn btn-primary mt-3.5"
                disabled={busy}
                onClick={() =>
                  save("booking", {
                    acceptingBookings: salon.acceptingBookings,
                    bookingHorizonDays: salon.bookingHorizonDays,
                    slotIntervalMin: salon.slotIntervalMin,
                  })
                }
              >
                Save booking settings
              </button>
            </Panel>
          </div>
        ) : null}

        {tab === "offers" ? <OffersPanel offers={offers} reload={load} /> : null}
      </div>
    </>
  );
}

function OffersPanel({ offers, reload }: { offers: Offer[]; reload: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [badge, setBadge] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!title.trim()) return toast("Give the offer a title.", "err");
    setBusy(true);
    try {
      await api("/api/owner/salon", {
        method: "PATCH",
        body: { section: "offer", action: "create", title, description, badge },
      });
      setTitle("");
      setDescription("");
      setBadge("");
      toast("Offer published to your salon page.");
      reload();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    await api("/api/owner/salon", { method: "PATCH", body: { section: "offer", action: "delete", id } });
    toast("Offer removed.");
    reload();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Live offers" flush>
        {offers.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted">
            No offers running. Offers appear right under your queue card.
          </p>
        ) : (
          offers.map((o, i) => (
            <div key={o.id} className={cx("flex items-start gap-3 px-4 py-3", i > 0 && "border-t border-line")}>
              <div className="min-w-0 flex-1">
                {o.badge ? <span className="chip chip-info">{o.badge}</span> : null}
                <p className="mt-1 text-[13.5px] font-medium">{o.title}</p>
                {o.description ? <p className="text-[12.5px] text-muted">{o.description}</p> : null}
              </div>
              <button className="btn btn-ghost btn-sm text-rose" onClick={() => remove(o.id)}>
                <IconX width={14} height={14} />
              </button>
            </div>
          ))
        )}
      </Panel>

      <Panel title="Create an offer">
        <div className="space-y-3">
          <Labeled label="Badge" hint="Short label, e.g. 'Weekend'.">
            <input className="field" value={badge} onChange={(e) => setBadge(e.target.value)} />
          </Labeled>
          <Labeled label="Title">
            <input
              className="field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Hair + Beard at ₹399"
            />
          </Labeled>
          <Labeled label="Details">
            <input
              className="field"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Valid Sunday only, walk-ins welcome."
            />
          </Labeled>
          <button className="btn btn-primary" onClick={add} disabled={busy}>
            {busy ? <Spinner /> : <IconPlus width={15} height={15} />} Publish offer
          </button>
        </div>
      </Panel>
    </div>
  );
}
