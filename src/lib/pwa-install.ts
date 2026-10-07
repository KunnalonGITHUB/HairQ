"use client";

import { useEffect, useState } from "react";

/**
 * Single source of truth for PWA installation.
 *
 * `beforeinstallprompt` fires once and must be captured immediately, but the
 * prompt itself may only be shown in response to a user gesture. We therefore
 * stash the event here and let any component trigger it later.
 */

export type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallState = {
  /** A native prompt is held and ready to fire. */
  canPrompt: boolean;
  /** Running as an installed app right now. */
  installed: boolean;
  /** iOS Safari: no native prompt, needs Share → Add to Home Screen. */
  iosManual: boolean;
};

let deferred: InstallEvent | null = null;
let installed = false;
let listening = false;

const subscribers = new Set<(s: InstallState) => void>();

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    window.matchMedia?.("(display-mode: fullscreen)").matches === true ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document);
  const webkit = /WebKit/.test(ua);
  const otherBrowser = /CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
  return iOS && webkit && !otherBrowser;
}

function snapshot(): InstallState {
  const standalone = installed || isStandaloneDisplay();
  return {
    canPrompt: Boolean(deferred) && !standalone,
    installed: standalone,
    iosManual: !standalone && !deferred && isIosSafari(),
  };
}

function emit() {
  const state = snapshot();
  for (const fn of subscribers) fn(state);
}

type InstallWindow = Window & {
  __hairqInstall?: InstallEvent | null;
  __hairqInstalled?: boolean;
};

/** Picks up an event captured by the pre-hydration inline script. */
function drainEarlyCapture() {
  if (typeof window === "undefined") return;
  const w = window as InstallWindow;
  if (w.__hairqInstalled) installed = true;
  if (w.__hairqInstall) deferred = w.__hairqInstall;
}

function startListening() {
  if (listening || typeof window === "undefined") return;
  listening = true;

  drainEarlyCapture();

  // The inline capture script re-broadcasts under these names.
  window.addEventListener("hairq:installready", () => {
    drainEarlyCapture();
    emit();
  });
  window.addEventListener("hairq:installed", () => {
    deferred = null;
    installed = true;
    emit();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    // Suppress the mini-infobar; we show our own CTA instead.
    event.preventDefault();
    deferred = event as InstallEvent;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });

  const mq = window.matchMedia?.("(display-mode: standalone)");
  mq?.addEventListener?.("change", (e) => {
    if (e.matches) {
      installed = true;
      deferred = null;
    }
    emit();
  });
}

/** Fires the stored native prompt. Returns the user's choice. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  drainEarlyCapture();
  if (!deferred) return "unavailable";
  const event = deferred;
  try {
    await event.prompt();
    const choice = await event.userChoice;
    // A prompt can only be used once.
    deferred = null;
    (window as InstallWindow).__hairqInstall = null;
    if (choice.outcome === "accepted") installed = true;
    emit();
    return choice.outcome;
  } catch {
    deferred = null;
    (window as InstallWindow).__hairqInstall = null;
    emit();
    return "unavailable";
  }
}

export function useInstallState(): InstallState {
  const [state, setState] = useState<InstallState>({
    canPrompt: false,
    installed: false,
    iosManual: false,
  });

  useEffect(() => {
    startListening();
    subscribers.add(setState);
    setState(snapshot());
    // Chrome can fire `beforeinstallprompt` slightly after hydration.
    const t = setTimeout(() => setState(snapshot()), 1200);
    return () => {
      subscribers.delete(setState);
      clearTimeout(t);
    };
  }, []);

  return state;
}
