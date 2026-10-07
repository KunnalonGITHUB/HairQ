"use client";

import { useState } from "react";
import { IconCheck, IconDownload, IconShare } from "@/components/icons";
import { cx, Modal, toast } from "@/components/ui";
import { isStandaloneDisplay, promptInstall, useInstallState } from "@/lib/pwa-install";
import { readProfile } from "@/lib/local-identity";

async function markInstalled(slug: string) {
  const profile = readProfile(slug);
  if (!profile.customerId) return;
  await fetch(`/api/public/${slug}/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pwa_installed", customerId: profile.customerId }),
  }).catch(() => undefined);
}

/**
 * "Get App" CTA. Never prompts on load — only on an explicit click.
 * Falls back to clear manual instructions where no native prompt exists.
 */
export function GetAppButton({
  slug,
  salonName,
  className,
  variant = "quiet",
}: {
  slug: string;
  salonName: string;
  className?: string;
  variant?: "quiet" | "brand";
}) {
  const { canPrompt, installed, iosManual } = useInstallState();
  const [showHelp, setShowHelp] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  // Already running as an installed app — nothing to offer.
  if (installed || justInstalled) {
    return (
      <span
        className={cx(
          "inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper-2 px-2.5 py-1.5 text-[12.5px] font-medium text-muted",
          className,
        )}
      >
        <IconCheck width={13} height={13} className="text-pine" />
        App added
      </span>
    );
  }

  const onClick = async () => {
    if (canPrompt) {
      const outcome = await promptInstall();
      if (outcome === "accepted") {
        setJustInstalled(true);
        toast(`${salonName} added to your phone.`);
        markInstalled(slug);
        return;
      }
      if (outcome === "dismissed") return;
      // Prompt was unavailable after all — show manual steps.
    }
    if (isStandaloneDisplay()) {
      setJustInstalled(true);
      return;
    }
    setShowHelp(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={cx("btn btn-sm", variant === "brand" ? "btn-brand" : "btn-quiet", className)}
      >
        <IconDownload width={14} height={14} />
        Get App
      </button>

      <Modal
        open={showHelp}
        onClose={() => setShowHelp(false)}
        title={`Add ${salonName} to your phone`}
        description="Takes a few seconds. There's nothing to download from an app store."
        footer={
          <button className="btn btn-quiet" onClick={() => setShowHelp(false)}>
            Got it
          </button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-line bg-paper-2 p-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/s/${slug}/icon.svg`}
              alt={salonName}
              className="h-11 w-11 shrink-0 rounded-xl shadow-[0_4px_12px_-6px_rgba(25,20,17,.5)]"
            />
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold leading-snug">{salonName}</p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
                Opens straight to the live queue, and lets us alert you when your turn is close.
              </p>
            </div>
          </div>

          {iosManual ? (
            <ol className="space-y-2.5">
              {[
                <>
                  Tap the <span className="font-medium text-ink">Share</span> button
                  <IconShare width={14} height={14} className="mx-1 inline align-[-2px] text-muted" />
                  at the bottom of Safari.
                </>,
                <>
                  Scroll down and choose{" "}
                  <span className="font-medium text-ink">Add to Home Screen</span>.
                </>,
                <>
                  Tap <span className="font-medium text-ink">Add</span> — {salonName} will appear with your
                  other apps.
                </>,
              ].map((step, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-2">
                  <span className="num grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-semibold text-white">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          ) : (
            <ol className="space-y-2.5">
              {[
                <>
                  Open your browser menu (<span className="font-medium text-ink">⋮</span> or{" "}
                  <span className="font-medium text-ink">⋯</span>).
                </>,
                <>
                  Choose <span className="font-medium text-ink">Install app</span> or{" "}
                  <span className="font-medium text-ink">Add to Home screen</span>.
                </>,
                <>Confirm, and {salonName} will be one tap away.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-2">
                  <span className="num grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-semibold text-white">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}

          <p className="border-t border-line pt-3 text-[12px] leading-snug text-muted">
            You don&apos;t need the app to join the queue or book — it just makes it faster.
          </p>
        </div>
      </Modal>
    </>
  );
}
