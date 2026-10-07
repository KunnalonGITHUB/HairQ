"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/ui";

/**
 * Premium dark notification card.
 *
 * This is purely presentational — it renders how a HairQ notification *looks*
 * on a customer's device. The sender identity is always the salon (name +
 * logo), never HairQ, and is passed in dynamically by the caller.
 */

export type NotificationKind = "queue" | "booking" | "marketing";

const KIND_GLYPH: Record<NotificationKind, string> = {
  queue: "👥",
  booking: "📅",
  marketing: "✂️",
};

function timeLabel(value: Date | string | number | undefined): string {
  if (!value) {
    return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Salon mark used as the notification sender avatar. */
function SenderMark({
  salonName,
  logoUrl,
  iconUrl,
}: {
  salonName: string;
  logoUrl?: string | null;
  iconUrl?: string | null;
}) {
  const src = logoUrl || iconUrl || null;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={salonName}
        width={26}
        height={26}
        className="h-[26px] w-[26px] shrink-0 rounded-[7px] object-cover ring-1 ring-white/10"
      />
    );
  }
  const initials = salonName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] bg-white/12 text-[10.5px] font-semibold tracking-tight text-white/90 ring-1 ring-white/10">
      {initials || "S"}
    </span>
  );
}

export function NotificationCard({
  salonName,
  logoUrl,
  iconUrl,
  title,
  body,
  kind = "queue",
  time,
  thumbnailUrl,
  showChevron = true,
  compact = false,
  className,
  onClick,
  footer,
}: {
  salonName: string;
  logoUrl?: string | null;
  iconUrl?: string | null;
  title: string;
  body: string;
  kind?: NotificationKind;
  time?: Date | string | number;
  thumbnailUrl?: string | null;
  showChevron?: boolean;
  compact?: boolean;
  className?: string;
  onClick?: () => void;
  footer?: ReactNode;
}) {
  // The body may carry intentional line breaks ("2 ahead\nApprox wait: 25 min").
  const lines = body.split("\n").filter((l) => l.trim().length > 0);
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      className={cx(
        "group relative block w-full overflow-hidden text-left",
        "rounded-[18px] border border-white/[0.09]",
        "bg-[linear-gradient(158deg,#232227_0%,#17171A_46%,#121214_100%)]",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_18px_38px_-22px_rgba(0,0,0,0.85)]",
        "backdrop-blur-xl",
        onClick && "transition-transform duration-150 active:scale-[0.995]",
        compact ? "px-3.5 py-3" : "px-4 py-3.5",
        className,
      )}
    >
      {/* top row — salon identity + time */}
      <div className="flex items-center gap-2">
        <SenderMark salonName={salonName} logoUrl={logoUrl} iconUrl={iconUrl} />
        <span className="min-w-0 truncate text-[12.5px] font-semibold leading-none tracking-[-0.005em] text-white/88">
          {salonName}
        </span>
        <span className="text-[12.5px] leading-none text-white/25">·</span>
        <span className="num shrink-0 text-[12.5px] leading-none text-white/42">{timeLabel(time)}</span>
        {showChevron ? (
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="ml-auto shrink-0 text-white/28"
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        ) : null}
      </div>

      {/* content */}
      <div className={cx("flex items-start gap-3", compact ? "mt-2" : "mt-2.5")}>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-[1.3] tracking-[-0.015em] text-white">
            {title}
          </p>
          <div className="mt-1 space-y-0.5">
            {lines.map((line, i) => (
              <p
                key={i}
                className={cx(
                  "text-[13.5px] leading-[1.45] text-white/58",
                  i > 0 && "text-white/45",
                )}
              >
                {line}
              </p>
            ))}
          </div>
        </div>

        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt=""
            className="h-[46px] w-[46px] shrink-0 rounded-[10px] object-cover ring-1 ring-white/10"
          />
        ) : (
          <span
            className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[10px] bg-white/[0.045] text-[17px] ring-1 ring-white/[0.07]"
            aria-hidden
          >
            {KIND_GLYPH[kind]}
          </span>
        )}
      </div>

      {footer ? <div className="mt-3 border-t border-white/[0.07] pt-2.5">{footer}</div> : null}
    </Wrapper>
  );
}

/**
 * Lock-screen style backdrop used behind the card in the owner's composer
 * preview, so the salon owner sees it in context.
 */
export function NotificationStage({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-[linear-gradient(170deg,#2B2A30_0%,#1C1B20_100%)] p-3">
      {children}
    </div>
  );
}
