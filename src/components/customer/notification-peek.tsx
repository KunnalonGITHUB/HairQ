"use client";

import { useEffect, useState } from "react";
import { NotificationCard, type NotificationKind } from "@/components/notification-card";

/**
 * In-app presentation of an incoming notification.
 *
 * Mirrors the native notification design so the experience is identical
 * whether the customer has the salon app open or closed. Presentation only —
 * it never triggers, sends or stores anything.
 */

export type PeekPayload = {
  salonName: string;
  logoUrl?: string | null;
  iconUrl?: string | null;
  title: string;
  body: string;
  kind?: NotificationKind;
  href?: string;
};

type PeekItem = PeekPayload & { id: number };

let seq = 0;
const listeners = new Set<(items: PeekItem[]) => void>();
let items: PeekItem[] = [];

function emit() {
  for (const fn of listeners) fn([...items]);
}

function dismiss(id: number) {
  items = items.filter((i) => i.id !== id);
  emit();
}

/** Shows a notification card in-app. */
export function peek(payload: PeekPayload) {
  const item = { ...payload, id: ++seq };
  items = [...items.slice(-1), item];
  emit();
  setTimeout(() => dismiss(item.id), 7000);
}

export function NotificationPeek() {
  const [list, setList] = useState<PeekItem[]>([]);

  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);

  if (list.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex justify-center px-3 pt-3">
      <div className="w-full max-w-md space-y-2">
        {list.map((item) => (
          <div key={item.id} className="rise pointer-events-auto">
            <NotificationCard
              salonName={item.salonName}
              logoUrl={item.logoUrl}
              iconUrl={item.iconUrl}
              title={item.title}
              body={item.body}
              kind={item.kind ?? "queue"}
              time={new Date()}
              onClick={() => {
                dismiss(item.id);
                if (item.href) window.location.assign(item.href);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
