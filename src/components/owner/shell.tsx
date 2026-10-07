"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  IconChart,
  IconGrid,
  IconLogout,
  IconMegaphone,
  IconMenu,
  IconQueue,
  IconScissors,
  IconSettings,
  IconTag,
  IconUsers,
  IconCalendar,
  IconX,
} from "@/components/icons";
import { cx, Toaster } from "@/components/ui";

const NAV = [
  {
    group: "Operations",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: IconGrid },
      { href: "/dashboard/queue", label: "Live Queue", icon: IconQueue, live: true },
      { href: "/dashboard/bookings", label: "Bookings", icon: IconCalendar },
    ],
  },
  {
    group: "People",
    items: [
      { href: "/dashboard/customers", label: "Customers", icon: IconUsers },
      { href: "/dashboard/audience", label: "Audience", icon: IconUsers },
      { href: "/dashboard/notifications", label: "Notifications", icon: IconMegaphone },
    ],
  },
  {
    group: "Salon setup",
    items: [
      { href: "/dashboard/services", label: "Services", icon: IconTag },
      { href: "/dashboard/staff", label: "Staff", icon: IconScissors },
      { href: "/dashboard/analytics", label: "Analytics", icon: IconChart },
      { href: "/dashboard/settings", label: "Salon Settings", icon: IconSettings },
    ],
  },
];

export function OwnerShell({
  children,
  user,
}: {
  children: ReactNode;
  user: { name: string; salonName: string; salonSlug: string; email: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [waiting, setWaiting] = useState<number | null>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/owner/summary?days=7", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { today?: { waiting?: number } };
        if (alive) setWaiting(json.today?.waiting ?? 0);
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
  }, [pathname]);

  const logout = async () => {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    router.push("/login");
    router.refresh();
  };

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-white">
          <IconScissors width={16} height={16} />
        </span>
        <span>
          <span className="block text-[15px] font-semibold leading-none tracking-[-0.02em]">HairQ</span>
          <span className="block text-[10.5px] uppercase tracking-[0.12em] text-faint">Owner console</span>
        </span>
        <button className="ml-auto p-1 text-muted lg:hidden" onClick={() => setOpen(false)}>
          <IconX width={18} height={18} />
        </button>
      </div>

      <div className="mx-3 mb-4 rounded-xl border border-line bg-surface px-3 py-2.5">
        <p className="truncate text-[13.5px] font-semibold leading-tight">{user.salonName}</p>
        <Link
          href={`/s/${user.salonSlug}`}
          target="_blank"
          className="num mt-0.5 block truncate text-[11.5px] text-muted hover:text-clay"
        >
          /s/{user.salonSlug} ↗
        </Link>
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((section) => (
          <div key={section.group} className="mb-4">
            <p className="px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint">
              {section.group}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cx(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                      active ? "bg-ink text-white" : "text-ink-2 hover:bg-black/[0.04]",
                    )}
                  >
                    <Icon width={16} height={16} className={active ? "opacity-90" : "opacity-60"} />
                    {item.label}
                    {item.live && waiting !== null && waiting > 0 ? (
                      <span
                        className={cx(
                          "num ml-auto rounded-full px-1.5 py-0.5 text-[10.5px] font-bold",
                          active ? "bg-white/15 text-white" : "bg-clay-soft text-clay",
                        )}
                      >
                        {waiting}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-line px-3 py-3">
        <div className="flex items-center gap-2.5 px-1.5">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-clay-soft text-[11px] font-semibold text-clay">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium leading-tight">{user.name}</span>
            <span className="block truncate text-[11px] text-faint">{user.email}</span>
          </span>
          <button onClick={logout} className="p-1.5 text-muted transition-colors hover:text-rose" title="Sign out">
            <IconLogout width={15} height={15} />
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh bg-paper">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] border-r border-line bg-paper-2 lg:block">
        {nav}
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/35" onClick={() => setOpen(false)} />
          <div className="rise absolute inset-y-0 left-0 w-[260px] border-r border-line bg-paper-2">{nav}</div>
        </div>
      ) : null}

      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-paper/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="p-1.5 text-ink">
          <IconMenu width={20} height={20} />
        </button>
        <span className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-white">
            <IconScissors width={12} height={12} />
          </span>
          <span className="text-[14px] font-semibold tracking-[-0.01em]">HairQ</span>
        </span>
        <Link href="/dashboard/queue" className="ml-auto flex items-center gap-1.5 text-[12.5px] text-muted">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-pine" />
          <span className="num">{waiting ?? 0}</span> waiting
        </Link>
      </header>

      <main className="lg:pl-[232px]">
        <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{children}</div>
      </main>
      <Toaster />
    </div>
  );
}

/* ------------------------------------------------------------ primitives */

export function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] sm:text-[25px]">{title}</h1>
        {subtitle ? <p className="mt-1 text-[13.5px] text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: "clay" | "pine" | "amber";
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p
        className={cx(
          "num mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.03em]",
          accent === "clay" && "text-clay",
          accent === "pine" && "text-pine",
          accent === "amber" && "text-amber",
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-1.5 text-[12px] leading-snug text-muted">{sub}</p> : null}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  flush,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-[13.5px] font-semibold tracking-[-0.01em]">{title}</h2>
          {action}
        </div>
      ) : null}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}
