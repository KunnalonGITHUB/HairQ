"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHead, Panel } from "@/components/owner/shell";
import { IconPlus, IconScissors, IconTag } from "@/components/icons";
import { api, Avatar, cx, EmptyState, Labeled, Modal, Spinner, toast } from "@/components/ui";

type Service = {
  id: number;
  name: string;
  description: string | null;
  category: string;
  price: number;
  durationMin: number;
  active: boolean;
  staffIds: number[];
};

type StaffMember = {
  id: number;
  name: string;
  role: string;
  bio: string | null;
  photoUrl: string | null;
  active: boolean;
  onShift: boolean;
  shiftStart: string;
  shiftEnd: string;
  serviceIds: number[];
  serving?: boolean;
  waitingFor?: number;
};

/* --------------------------------------------------------------- services */

const BLANK_SERVICE = {
  id: 0,
  name: "",
  description: "",
  category: "Hair",
  price: 300,
  durationMin: 30,
  active: true,
  staffIds: [] as number[],
};

export function ServicesView() {
  const [data, setData] = useState<{ services: Service[]; staff: StaffMember[] } | null>(null);
  const [editing, setEditing] = useState<typeof BLANK_SERVICE | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/owner/services", { cache: "no-store" });
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      if (editing.id) {
        await api(`/api/owner/services/${editing.id}`, { method: "PATCH", body: editing });
      } else {
        await api("/api/owner/services", { body: editing });
      }
      toast("Service saved.");
      setEditing(null);
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save.", "err");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      const res = await api<{ archived?: boolean }>(`/api/owner/services/${id}`, { method: "DELETE" });
      toast(res.archived ? "Service archived — it's used by past bookings." : "Service removed.");
      setEditing(null);
      load();
    } catch {
      toast("Couldn't remove that service.", "err");
    }
  };

  const toggle = async (s: Service) => {
    await api(`/api/owner/services/${s.id}`, { method: "PATCH", body: { active: !s.active } });
    load();
  };

  return (
    <>
      <PageHead
        title="Services"
        subtitle="Durations drive every queue estimate and booking slot — keep them honest."
        actions={
          <button className="btn btn-primary" onClick={() => setEditing({ ...BLANK_SERVICE })}>
            <IconPlus width={15} height={15} />
            Add service
          </button>
        }
      />

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {!data ? (
          <div className="h-56 animate-pulse bg-line/30" />
        ) : data.services.length === 0 ? (
          <EmptyState
            title="No services yet"
            hint="Add your menu so customers can pick what they want and your queue times stay accurate."
            icon={<IconTag width={18} height={18} />}
            action={
              <button className="btn btn-quiet btn-sm" onClick={() => setEditing({ ...BLANK_SERVICE })}>
                Add your first service
              </button>
            }
          />
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Category</th>
                  <th>Duration</th>
                  <th>Price</th>
                  <th>Performed by</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.services.map((s) => (
                  <tr key={s.id} className={cx(!s.active && "opacity-55")}>
                    <td>
                      <p className="text-[13.5px] font-medium">{s.name}</p>
                      {s.description ? <p className="text-[12px] text-muted">{s.description}</p> : null}
                    </td>
                    <td className="text-[13px] text-ink-2">{s.category}</td>
                    <td className="num text-[13px]">{s.durationMin} min</td>
                    <td className="num text-[13px] font-medium">₹{s.price}</td>
                    <td className="text-[12.5px] text-muted">
                      {s.staffIds.length === 0
                        ? "Everyone"
                        : s.staffIds
                            .map((id) => data.staff.find((m) => m.id === id)?.name)
                            .filter(Boolean)
                            .join(", ")}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <button className="btn btn-ghost btn-sm" onClick={() => toggle(s)}>
                          {s.active ? "Hide" : "Show"}
                        </button>
                        <button
                          className="btn btn-quiet btn-sm"
                          onClick={() =>
                            setEditing({
                              ...s,
                              description: s.description ?? "",
                            })
                          }
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit service" : "Add a service"}
        description="Duration is used for live queue estimates and booking availability."
        footer={
          <>
            {editing?.id ? (
              <button className="btn btn-danger mr-auto" onClick={() => remove(editing.id)}>
                Remove
              </button>
            ) : null}
            <button className="btn btn-quiet" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? <Spinner /> : null} Save service
            </button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="Name">
                <input
                  className="field"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  autoFocus
                />
              </Labeled>
              <Labeled label="Category">
                <input
                  className="field"
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                  placeholder="Hair, Beard, Colour…"
                />
              </Labeled>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="Price (₹)">
                <input
                  type="number"
                  className="field"
                  value={editing.price}
                  onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
                />
              </Labeled>
              <Labeled label="Duration (minutes)">
                <input
                  type="number"
                  step={5}
                  className="field"
                  value={editing.durationMin}
                  onChange={(e) => setEditing({ ...editing, durationMin: Number(e.target.value) })}
                />
              </Labeled>
            </div>
            <Labeled label="Description">
              <input
                className="field"
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </Labeled>
            <div>
              <span className="lbl">Who can perform it</span>
              <div className="flex flex-wrap gap-1.5">
                {data?.staff.map((m) => {
                  const on = editing.staffIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() =>
                        setEditing({
                          ...editing,
                          staffIds: on
                            ? editing.staffIds.filter((x) => x !== m.id)
                            : [...editing.staffIds, m.id],
                        })
                      }
                      className={cx(
                        "rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                        on ? "border-transparent bg-ink text-white" : "border-line text-ink-2",
                      )}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ staff */

const BLANK_STAFF = {
  id: 0,
  name: "",
  role: "Barber",
  bio: "",
  photoUrl: "",
  active: true,
  onShift: true,
  shiftStart: "10:00",
  shiftEnd: "21:00",
  serviceIds: [] as number[],
};

export function StaffView() {
  const [data, setData] = useState<{ staff: StaffMember[]; services: { id: number; name: string }[] } | null>(
    null,
  );
  const [editing, setEditing] = useState<typeof BLANK_STAFF | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/owner/staff", { cache: "no-store" });
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      if (editing.id) {
        await api(`/api/owner/staff/${editing.id}`, { method: "PATCH", body: editing });
      } else {
        await api("/api/owner/staff", { body: editing });
      }
      toast("Team member saved.");
      setEditing(null);
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save.", "err");
    } finally {
      setBusy(false);
    }
  };

  const quickToggle = async (m: StaffMember, patch: Partial<StaffMember>) => {
    await api(`/api/owner/staff/${m.id}`, { method: "PATCH", body: patch });
    load();
  };

  return (
    <>
      <PageHead
        title="Staff"
        subtitle="Chairs on shift decide how fast your queue moves."
        actions={
          <button className="btn btn-primary" onClick={() => setEditing({ ...BLANK_STAFF })}>
            <IconPlus width={15} height={15} />
            Add team member
          </button>
        }
      />

      {!data ? (
        <div className="h-56 animate-pulse rounded-xl bg-line/40" />
      ) : data.staff.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            title="No team members yet"
            hint="Add your barbers so customers can pick a favourite and your queue maths knows how many chairs are running."
            icon={<IconScissors width={18} height={18} />}
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.staff.map((m) => (
            <div key={m.id} className={cx("rounded-xl border border-line bg-surface p-4", !m.active && "opacity-60")}>
              <div className="flex items-start gap-3">
                <Avatar name={m.name} src={m.photoUrl} size={42} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold tracking-[-0.01em]">{m.name}</p>
                  <p className="truncate text-[12.5px] text-muted">{m.role}</p>
                </div>
                {m.serving ? <span className="chip chip-serving">Busy</span> : null}
              </div>

              <div className="mt-3 flex items-center gap-2 text-[12.5px] text-muted">
                <span className="num">
                  {m.shiftStart} – {m.shiftEnd}
                </span>
                <span className="text-faint">·</span>
                <span>{m.serviceIds.length === 0 ? "All services" : `${m.serviceIds.length} services`}</span>
              </div>

              <div className="mt-3.5 flex items-center justify-between border-t border-line pt-3">
                <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={m.onShift}
                    onChange={() => quickToggle(m, { onShift: !m.onShift })}
                    className="h-4 w-4 accent-[#1f5048]"
                  />
                  On shift today
                </label>
                <button
                  className="btn btn-quiet btn-sm"
                  onClick={() =>
                    setEditing({
                      id: m.id,
                      name: m.name,
                      role: m.role,
                      bio: m.bio ?? "",
                      photoUrl: m.photoUrl ?? "",
                      active: m.active,
                      onShift: m.onShift,
                      shiftStart: m.shiftStart,
                      shiftEnd: m.shiftEnd,
                      serviceIds: m.serviceIds,
                    })
                  }
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit team member" : "Add a team member"}
        footer={
          <>
            <button className="btn btn-quiet" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? <Spinner /> : null} Save
            </button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="Name">
                <input
                  className="field"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  autoFocus
                />
              </Labeled>
              <Labeled label="Role">
                <input
                  className="field"
                  value={editing.role}
                  onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                />
              </Labeled>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="Shift start">
                <input
                  type="time"
                  className="field"
                  value={editing.shiftStart}
                  onChange={(e) => setEditing({ ...editing, shiftStart: e.target.value })}
                />
              </Labeled>
              <Labeled label="Shift end">
                <input
                  type="time"
                  className="field"
                  value={editing.shiftEnd}
                  onChange={(e) => setEditing({ ...editing, shiftEnd: e.target.value })}
                />
              </Labeled>
            </div>
            <Labeled label="Photo URL" hint="Optional — shown on your salon page.">
              <input
                className="field"
                value={editing.photoUrl}
                onChange={(e) => setEditing({ ...editing, photoUrl: e.target.value })}
              />
            </Labeled>
            <div>
              <span className="lbl">Services they perform</span>
              <div className="flex flex-wrap gap-1.5">
                {data?.services.map((s) => {
                  const on = editing.serviceIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() =>
                        setEditing({
                          ...editing,
                          serviceIds: on
                            ? editing.serviceIds.filter((x) => x !== s.id)
                            : [...editing.serviceIds, s.id],
                        })
                      }
                      className={cx(
                        "rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                        on ? "border-transparent bg-ink text-white" : "border-line text-ink-2",
                      )}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-4 border-t border-line pt-3">
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                  className="h-4 w-4 accent-[#1f5048]"
                />
                Active
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={editing.onShift}
                  onChange={(e) => setEditing({ ...editing, onShift: e.target.checked })}
                  className="h-4 w-4 accent-[#1f5048]"
                />
                On shift today
              </label>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
