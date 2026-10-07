"use client";

/**
 * Customers never create an account. We keep a tiny local profile per salon so
 * returning visitors land straight on their ticket instead of a sign-in wall.
 */
export type LocalProfile = {
  customerId?: number;
  name?: string;
  phone?: string;
  ticket?: string;
  booking?: string;
};

const key = (slug: string) => `hairq:${slug}`;

export function readProfile(slug: string): LocalProfile {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key(slug));
    return raw ? (JSON.parse(raw) as LocalProfile) : {};
  } catch {
    return {};
  }
}

export function writeProfile(slug: string, patch: LocalProfile): LocalProfile {
  if (typeof window === "undefined") return {};
  const next = { ...readProfile(slug), ...patch };
  try {
    window.localStorage.setItem(key(slug), JSON.stringify(next));
  } catch {
    /* storage disabled — the app still works, just without memory */
  }
  return next;
}

export function clearTicket(slug: string) {
  const current = readProfile(slug);
  delete current.ticket;
  try {
    window.localStorage.setItem(key(slug), JSON.stringify(current));
  } catch {
    /* ignore */
  }
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
