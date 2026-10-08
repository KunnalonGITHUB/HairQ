"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconCheck, IconX } from "./icons";
import { authRequestHeaders } from "@/lib/auth-client";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ toast */

type Toast = { id: number; text: string; tone: "ok" | "err" };
let toastId = 0;
const listeners = new Set<(t: Toast[]) => void>();
let toasts: Toast[] = [];

function emit() {
  for (const l of listeners) l([...toasts]);
}

export function toast(text: string, tone: "ok" | "err" = "ok") {
  const t = { id: ++toastId, text, tone };
  toasts = [...toasts, t];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    emit();
  }, 3600);
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[70] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2 sm:left-auto sm:right-5 sm:translate-x-0">
      {items.map((t) => (
        <div
          key={t.id}
          className={cx(
            "rise pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-[0_8px_24px_-12px_rgba(25,20,17,.35)]",
            t.tone === "ok"
              ? "border-[#cfe0da] bg-white text-ink"
              : "border-[#f0d7d5] bg-white text-rose",
          )}
        >
          <span
            className={cx(
              "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-white",
              t.tone === "ok" ? "bg-pine" : "bg-rose",
            )}
          >
            {t.tone === "ok" ? <IconCheck width={11} height={11} /> : <IconX width={11} height={11} />}
          </span>
          <span className="leading-snug">{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ chips */

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  waiting: { label: "Waiting", cls: "chip-waiting" },
  serving: { label: "In the chair", cls: "chip-serving" },
  completed: { label: "Completed", cls: "chip-done" },
  cancelled: { label: "Cancelled", cls: "chip-cancelled" },
  skipped: { label: "Skipped", cls: "chip-cancelled" },
  no_show: { label: "No show", cls: "chip-cancelled" },
  confirmed: { label: "Confirmed", cls: "chip-serving" },
  arrived: { label: "Arrived", cls: "chip-info" },
  open: { label: "Queue open", cls: "chip-serving" },
  paused: { label: "Queue paused", cls: "chip-waiting" },
  closed: { label: "Queue closed", cls: "chip-cancelled" },
};

export function StatusChip({ status, className }: { status: string; className?: string }) {
  const s = STATUS_MAP[status] ?? { label: status, cls: "chip-done" };
  return <span className={cx("chip", s.cls, className)}>{s.label}</span>;
}

/* ------------------------------------------------------------- empty state */

export function EmptyState({
  title,
  hint,
  action,
  icon,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon ? (
        <div className="mb-3.5 grid h-11 w-11 place-items-center rounded-xl border border-line bg-paper-2 text-faint">
          {icon}
        </div>
      ) : null}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {hint ? <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ modal */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-[#191411]/35 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          "rise relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface shadow-[0_24px_60px_-24px_rgba(25,20,17,.4)] sm:rounded-2xl",
          width,
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-surface px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
            {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm -mr-1.5 -mt-1" aria-label="Close">
            <IconX width={16} height={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-paper-2 px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- avatar */

const TONES = ["#bc5a2e", "#1f5048", "#a9771a", "#52607a", "#7a4a63", "#3d6b4a"];

export function Avatar({
  name,
  src,
  size = 36,
}: {
  name: string;
  src?: string | null;
  size?: number;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const tone = TONES[(name.charCodeAt(0) + name.length) % TONES.length];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full border border-line object-cover"
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size, background: `${tone}1a`, color: tone, fontSize: size * 0.36 }}
      className="grid shrink-0 place-items-center rounded-full font-semibold"
    >
      {initials || "?"}
    </span>
  );
}

/* ------------------------------------------------------------------ field */

export function Labeled({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="lbl">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] text-muted">{hint}</span> : null}
    </label>
  );
}

/* ------------------------------------------------------------- segmented */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="thin-scroll flex gap-1 overflow-x-auto rounded-xl border border-line bg-paper-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
            value === o.value
              ? "bg-surface text-ink shadow-[0_1px_2px_rgba(25,20,17,.08)]"
              : "text-muted hover:text-ink",
          )}
        >
          {o.label}
          {o.count !== undefined ? (
            <span className="num ml-1.5 text-[11px] text-faint">{o.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ hooks */

export function usePoll<T>(url: string | null, intervalMs = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!url) return;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as T;
      if (mounted.current) {
        setData(json);
        setError(null);
      }
    } catch {
      if (mounted.current) setError("We couldn't reach the salon just now. Retrying…");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    mounted.current = true;
    load();
    const id = setInterval(load, intervalMs);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mounted.current = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, intervalMs]);

  return { data, error, loading, refresh: load };
}

export async function api<T = unknown>(
  url: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(url, {
    method: options?.method ?? "POST",
    headers: (url.startsWith("/api/owner/") || url === "/api/auth") && !["GET", "HEAD"].includes(options?.method ?? "POST") ? await authRequestHeaders() : { "Content-Type": "application/json" },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: string }).error ?? "Something went wrong. Please try again.");
  }
  return json as T;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent",
        className,
      )}
    />
  );
}
