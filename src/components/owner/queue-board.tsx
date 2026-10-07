"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHead, StatTile } from "@/components/owner/shell";
import {
  IconArrowDown,
  IconArrowUp,
  IconBell,
  IconCheck,
  IconPlus,
  IconQueue,
  IconX,
} from "@/components/icons";
import { api, cx, EmptyState, Labeled, Modal, Spinner, StatusChip, toast, usePoll } from "@/components/ui";
import { humanDuration } from "@/lib/time";

type Entry = {
  id: number;
  token: string;
  status: string;
  durationMin: number;
  source: string;
  chair: string | null;
  notes: string | null;
  joinedAt: string;
  startedAt: string | null;
  customerId: number;
  customerName: string;
  customerPhone: string;
  serviceId: number;
  serviceName: string;
  servicePrice: number;
  staffId: number | null;
  staffName: string | null;
  projPosition: number;
  ahead: number;
  startLabel: string;
  waitMin: number;
};

type Payload = {
  salon: { name: string; slug: string; queueStatus: string; maxQueueSize: number; currency: string };
  serving: Entry[];
  waiting: Entry[];
  chairs: { staffId: number; name: string }[];
  chairCount: number;
  workloadMin: number;
  nextOpeningInMin: number;
  services: { id: number; name: string; durationMin: number; price: number }[];
  staff: { id: number; name: string; onShift: boolean; active: boolean }[];
  stats: { servedToday: number; avgWait: number; revenueToday: number };
};

export function QueueBoard({ openAdd }: { openAdd?: boolean }) {
  const { data, refresh } = usePoll<Payload>("/api/owner/queue", 5000);
  const [showAdd, setShowAdd] = useState(Boolean(openAdd));
  const [editing, setEditing] = useState<Entry | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const act = async (id: number, body: Record<string, unknown>, message?: string) => {
    try {
      await api(`/api/owner/queue/${id}`, { method: "PATCH", body });
      if (message) toast(message);
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That didn't work.", "err");
    }
  };

  const setQueueStatus = async (queueStatus: string) => {
    try {
      await api("/api/owner/queue", { method: "PATCH", body: { queueStatus } });
      toast(
        queueStatus === "open"
          ? "Queue is open — customers can join."
          : queueStatus === "paused"
            ? "Queue paused. Existing customers keep their place."
            : "Queue closed for new customers.",
      );
      refresh();
    } catch {
      toast("Couldn't change the queue status.", "err");
    }
  };

  if (!data) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-48 animate-pulse rounded bg-line" />
        <div className="h-28 animate-pulse rounded-xl bg-line/60" />
        <div className="h-64 animate-pulse rounded-xl bg-line/40" />
      </div>
    );
  }

  const clearIn = data.workloadMin;

  return (
    <>
      <PageHead
        title="Live queue"
        subtitle={`${data.chairCount} ${data.chairCount === 1 ? "chair" : "chairs"} working · everyone in one line, walk-in or online`}
        actions={
          <>
            <div className="flex rounded-lg border border-line bg-surface p-0.5">
              {(["open", "paused", "closed"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setQueueStatus(s)}
                  className={cx(
                    "rounded-md px-2.5 py-1.5 text-[12.5px] font-medium capitalize transition-colors",
                    data.salon.queueStatus === s
                      ? s === "open"
                        ? "bg-pine text-white"
                        : s === "paused"
                          ? "bg-amber text-white"
                          : "bg-rose text-white"
                      : "text-muted hover:text-ink",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
              <IconPlus width={15} height={15} />
              Add walk-in
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Waiting" value={data.waiting.length} sub={`Cap ${data.salon.maxQueueSize}`} accent="clay" />
        <StatTile label="In the chair" value={data.serving.length} sub={`${data.chairCount} chairs`} accent="pine" />
        <StatTile
          label="Queue clears in"
          value={clearIn === 0 ? "—" : humanDuration(clearIn)}
          sub="Based on real service times"
        />
        <StatTile label="Served today" value={data.stats.servedToday} sub={`Avg wait ${data.stats.avgWait} min`} />
      </div>

      {/* ------------------------------------------------- currently serving */}
      <section className="mt-6">
        <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          Currently serving
        </h2>
        {data.serving.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-2 bg-surface/60 px-4 py-6 text-center">
            <p className="text-[13.5px] font-medium">No one is in the chair</p>
            <p className="mt-1 text-[12.5px] text-muted">Start the next customer when your barber is free.</p>
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {data.serving.map((e) => {
              const started = e.startedAt ? new Date(e.startedAt) : new Date();
              const elapsed = Math.floor((Date.now() - started.getTime()) / 1000);
              const over = elapsed / 60 > e.durationMin;
              return (
                <div key={e.id} className="rounded-xl border border-[#cfe0da] bg-pine-soft/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">{e.customerName}</p>
                      <p className="mt-0.5 text-[12.5px] text-ink-2">
                        {e.serviceName} · {e.staffName ?? "Unassigned"}
                        {e.chair ? ` · ${e.chair}` : ""}
                      </p>
                    </div>
                    <StatusChip status="serving" />
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className={cx("num text-[22px] font-semibold leading-none", over ? "text-rose" : "text-pine")}>
                        {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
                      </p>
                      <p className="mt-1 text-[11.5px] text-muted">
                        of {e.durationMin} min
                        {over ? " · running over" : ""}
                        <span className="hidden sm:inline">
                          {" "}
                          · started{" "}
                          {started.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </span>
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <button className="btn btn-quiet btn-sm" onClick={() => setEditing(e)}>
                        Edit
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => act(e.id, { action: "complete" }, `${e.customerName} marked complete.`)}
                      >
                        <IconCheck width={14} height={14} />
                        Complete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* --------------------------------------------------------- waiting */}
      <section className="mt-6">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Waiting · {data.waiting.length}
          </h2>
          {data.waiting.length > 0 ? (
            <p className="num text-[12px] text-muted">
              Next free chair in {humanDuration(data.nextOpeningInMin)}
            </p>
          ) : null}
        </div>

        {data.waiting.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface">
            <EmptyState
              title="Your queue is clear"
              hint="Walk-ins you add and customers who join from your salon link will line up here automatically."
              icon={<IconQueue width={18} height={18} />}
              action={
                <button className="btn btn-quiet btn-sm" onClick={() => setShowAdd(true)}>
                  Add a walk-in
                </button>
              }
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            {data.waiting.map((e, i) => (
              <div
                key={e.id}
                className={cx(
                  "flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3 transition-colors hover:bg-paper-2",
                  i > 0 && "border-t border-line",
                )}
              >
                <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-paper text-[12.5px] font-semibold text-ink-2">
                  {e.projPosition}
                </span>
                <div className="min-w-[130px] flex-1">
                  <p className="truncate text-[14px] font-medium leading-tight">{e.customerName}</p>
                  <p className="num truncate text-[12px] text-muted">
                    {e.customerPhone}
                    {e.source === "walk_in" ? " · walk-in" : e.source === "booking" ? " · booking" : " · online"}
                  </p>
                </div>
                <div className="min-w-[120px]">
                  <p className="text-[13px] font-medium">{e.serviceName}</p>
                  <p className="num text-[12px] text-muted">
                    {e.durationMin} min · {e.staffName ?? "Any barber"}
                  </p>
                </div>
                <div className="min-w-[88px] text-right">
                  <p className="num text-[13px] font-semibold">{e.startLabel}</p>
                  <p className="num text-[11.5px] text-muted">in {humanDuration(e.waitMin)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="btn btn-ghost btn-sm px-1.5"
                    title="Move up"
                    disabled={i === 0}
                    onClick={() => act(e.id, { action: "move", direction: "up" })}
                  >
                    <IconArrowUp width={14} height={14} />
                  </button>
                  <button
                    className="btn btn-ghost btn-sm px-1.5"
                    title="Move down"
                    disabled={i === data.waiting.length - 1}
                    onClick={() => act(e.id, { action: "move", direction: "down" })}
                  >
                    <IconArrowDown width={14} height={14} />
                  </button>
                  <button
                    className="btn btn-ghost btn-sm px-1.5"
                    title="Notify customer"
                    onClick={() => act(e.id, { action: "notify" }, `Nudged ${e.customerName}.`)}
                  >
                    <IconBell width={14} height={14} />
                  </button>
                  <button className="btn btn-quiet btn-sm" onClick={() => setEditing(e)}>
                    Edit
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => act(e.id, { action: "start" }, `${e.customerName} is in the chair.`)}
                  >
                    Start
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <AddWalkIn
        open={showAdd}
        onClose={() => setShowAdd(false)}
        services={data.services}
        staff={data.staff}
        onDone={() => {
          setShowAdd(false);
          refresh();
        }}
      />

      <EditEntry
        entry={editing}
        services={data.services}
        staff={data.staff}
        onClose={() => setEditing(null)}
        onDone={() => {
          setEditing(null);
          refresh();
        }}
      />
    </>
  );
}

function AddWalkIn({
  open,
  onClose,
  services,
  staff,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  services: Payload["services"];
  staff: Payload["staff"];
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceId, setServiceId] = useState<number | "">("");
  const [staffId, setStaffId] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setPhone("");
      setServiceId(services[0]?.id ?? "");
      setStaffId("");
      setNotes("");
    }
  }, [open, services]);

  const submit = async () => {
    setBusy(true);
    try {
      await api("/api/owner/queue", {
        body: { name, phone, serviceId: serviceId || null, staffId: staffId || null, notes },
      });
      toast(`${name} added to the queue.`);
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't add them.", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a walk-in"
      description="They join the same queue as online customers."
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : null} Add to queue
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Name">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Labeled>
          <Labeled label="Phone">
            <input
              className="field"
              value={phone}
              inputMode="tel"
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765 43210"
            />
          </Labeled>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Service">
            <select
              className="field"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value ? Number(e.target.value) : "")}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.durationMin} min
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label="Barber">
            <select
              className="field"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Any barber</option>
              {staff
                .filter((s) => s.active)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.onShift ? "" : " (off shift)"}
                  </option>
                ))}
            </select>
          </Labeled>
        </div>
        <Labeled label="Notes" hint="Optional — e.g. 'scissors only, no machine'.">
          <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Labeled>
      </div>
    </Modal>
  );
}

function EditEntry({
  entry,
  services,
  staff,
  onClose,
  onDone,
}: {
  entry: Entry | null;
  services: Payload["services"];
  staff: Payload["staff"];
  onClose: () => void;
  onDone: () => void;
}) {
  const [serviceId, setServiceId] = useState<number | "">("");
  const [staffId, setStaffId] = useState<number | "">("");
  const [chair, setChair] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (entry) {
      setServiceId(entry.serviceId);
      setStaffId(entry.staffId ?? "");
      setChair(entry.chair ?? "");
    }
  }, [entry]);

  const run = async (body: Record<string, unknown>, message: string) => {
    if (!entry) return;
    setBusy(true);
    try {
      await api(`/api/owner/queue/${entry.id}`, { method: "PATCH", body });
      toast(message);
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That didn't work.", "err");
    } finally {
      setBusy(false);
    }
  };

  const duration = useMemo(
    () => services.find((s) => s.id === serviceId)?.durationMin ?? entry?.durationMin ?? 0,
    [serviceId, services, entry],
  );

  if (!entry) return null;

  return (
    <Modal
      open={Boolean(entry)}
      onClose={onClose}
      title={entry.customerName}
      description={`Joined at ${new Date(entry.joinedAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })} · ${entry.customerPhone}`}
      footer={
        <>
          <button
            className="btn btn-danger mr-auto"
            disabled={busy}
            onClick={() => run({ action: "cancel" }, `${entry.customerName} removed from the queue.`)}
          >
            <IconX width={14} height={14} />
            Remove
          </button>
          <button
            className="btn btn-quiet"
            disabled={busy}
            onClick={() => run({ action: "skip" }, `${entry.customerName} skipped.`)}
          >
            Skip
          </button>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              run(
                { action: "update", serviceId, staffId: staffId || null, chair: chair || null },
                "Queue entry updated.",
              )
            }
          >
            {busy ? <Spinner /> : null} Save changes
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Service" hint={`${duration} min`}>
            <select
              className="field"
              value={serviceId}
              onChange={(e) => setServiceId(Number(e.target.value))}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.durationMin} min
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label="Barber">
            <select
              className="field"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Any barber</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Labeled>
        </div>
        <Labeled label="Chair / station" hint="Shown on the floor board.">
          <input className="field" value={chair} onChange={(e) => setChair(e.target.value)} placeholder="Chair 1" />
        </Labeled>
        {entry.notes ? (
          <p className="rounded-lg bg-paper-2 px-3 py-2 text-[13px] text-ink-2">Note: {entry.notes}</p>
        ) : null}
      </div>
    </Modal>
  );
}
