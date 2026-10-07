"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconBell, IconX } from "@/components/icons";
import { cx } from "@/components/ui";
import { readProfile } from "@/lib/local-identity";
import { ensureServiceWorker, healPushSubscription } from "@/lib/push-client";
import { isStandaloneDisplay, promptInstall, useInstallState } from "@/lib/pwa-install";

export function SalonMark({
  name,
  logoUrl,
  size = 40,
}: {
  name: string;
  logoUrl?: string | null;
  size?: number;
}) {
  const label = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={logoUrl}
        alt={name}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-xl border border-line object-cover"
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size, background: "var(--brand)", fontSize: size * 0.38 }}
      className="grid shrink-0 place-items-center rounded-xl font-semibold tracking-tight text-white"
    >
      {label || "S"}
    </span>
  );
}

export function SalonTopBar({
  slug,
  name,
  logoUrl,
  openLabel,
  open,
  back,
}: {
  slug: string;
  name: string;
  logoUrl?: string | null;
  openLabel?: string;
  open?: boolean;
  back?: { href: string; label: string };
}) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const profile = readProfile(slug);
    if (!profile.customerId) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/public/${slug}/notify?customerId=${profile.customerId}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as { unread?: number };
        if (alive) setUnread(json.unread ?? 0);
      } catch {
        /* silent */
      }
    };
    load();
    const id = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [slug]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
        {back ? (
          <Link
            href={back.href}
            className="-ml-1 flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {back.label}
          </Link>
        ) : (
          <Link href={`/s/${slug}`} className="flex min-w-0 items-center gap-2.5">
            <SalonMark name={name} logoUrl={logoUrl} size={34} />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold leading-tight tracking-[-0.01em]">
                {name}
              </span>
              {openLabel ? (
                <span className="flex items-center gap-1.5 text-[11.5px] leading-tight text-muted">
                  <span
                    className={cx(
                      "inline-block h-1.5 w-1.5 rounded-full",
                      open ? "bg-pine live-dot" : "bg-faint",
                    )}
                  />
                  {openLabel}
                </span>
              ) : null}
            </span>
          </Link>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Link
            href={`/s/${slug}/me`}
            className="relative grid h-9 w-9 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-black/5"
            aria-label="Your visits and updates"
          >
            <IconBell width={18} height={18} />
            {unread > 0 ? (
              <span
                className="num absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white"
                style={{ background: "var(--brand)" }}
              >
                {unread}
              </span>
            ) : null}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function PwaBoot({ slug }: { slug: string }) {
  const { canPrompt, installed, iosManual } = useInstallState();
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");

  // Service worker + push self-healing. Runs once per salon page load.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      await ensureServiceWorker();
      if (cancelled) return;

      const profile = readProfile(slug);
      if (!profile.customerId) return;

      // Permission may have been granted long before push transport existed.
      // Verify a real subscription and quietly create one if it is missing.
      await healPushSubscription(slug, profile.customerId);

      if (isStandaloneDisplay()) {
        fetch(`/api/public/${slug}/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "pwa_installed", customerId: profile.customerId }),
        }).catch(() => undefined);
      }
    })();

    fetch(`/api/public/${slug}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { salon?: { name?: string } }) => !cancelled && setName(d.salon?.name ?? ""))
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Record the install once it actually happens.
  useEffect(() => {
    if (!installed) return;
    setShow(false);
    const profile = readProfile(slug);
    if (!profile.customerId) return;
    fetch(`/api/public/${slug}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pwa_installed", customerId: profile.customerId }),
    }).catch(() => undefined);
  }, [installed, slug]);

  // Subtle, delayed nudge — never an automatic prompt.
  useEffect(() => {
    if (installed) return;
    if (sessionStorage.getItem(`hairq:install:${slug}`)) return;
    const timer = setTimeout(() => setShow(true), 9000);
    return () => clearTimeout(timer);
  }, [installed, slug]);

  const dismiss = () => {
    sessionStorage.setItem(`hairq:install:${slug}`, "1");
    setShow(false);
  };

  if (!show || !name || installed) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3">
      <div className="rise mx-auto flex max-w-xl items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-[0_16px_40px_-20px_rgba(25,20,17,.45)]">
        <SalonMark name={name} size={38} />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold leading-snug">Add {name} to your phone</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
            Faster access, live queue updates and offers — no app store needed.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            {canPrompt ? (
              <button
                className="btn btn-brand btn-sm"
                onClick={async () => {
                  await promptInstall();
                  dismiss();
                }}
              >
                Add to home screen
              </button>
            ) : (
              <span className="text-[12px] text-muted">
                {iosManual ? (
                  <>
                    Tap <span className="font-medium text-ink-2">Share</span> →{" "}
                    <span className="font-medium text-ink-2">Add to Home Screen</span>
                  </>
                ) : (
                  <>
                    Tap your browser menu →{" "}
                    <span className="font-medium text-ink-2">Add to Home Screen</span>
                  </>
                )}
              </span>
            )}
            <button className="btn btn-ghost btn-sm" onClick={dismiss}>
              Not now
            </button>
          </div>
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="-mr-1 -mt-1 p-1 text-faint hover:text-ink">
          <IconX width={15} height={15} />
        </button>
      </div>
    </div>
  );
}
