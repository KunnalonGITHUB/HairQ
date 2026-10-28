"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageHead, Panel, StatTile } from "@/components/owner/shell";
import { IconPlus, IconSearch, IconUsers } from "@/components/icons";
import { api, Avatar, cx, EmptyState, Labeled, Modal, Spinner, toast } from "@/components/ui";
import { sinceLabel } from "@/lib/time";
import { formatSalonDate, formatSalonTime } from "@/lib/salon-time";

type Row = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  totalVisits: number;
  totalSpend: number;
  loyaltyPoints: number;
  lastVisitAt: string | null;
  lastActivityAt: string | null;
  pwaInstalled: boolean;
  source: string;
  preferredStaffName: string | null;
  lastServiceName: string | null;
  subscribed: boolean;
  marketingOptIn: boolean | null;
  daysSinceVisit: number | null;
};

type Payload = {
  customers: Row[];
  segments: Record<string, number>;
  staff: { id: number; name: string }[];
};

const SORTS = [
  { value: "recent", label: "Recent activity" },
  { value: "name", label: "Name A–Z" },
  { value: "visits", label: "Most visits" },
  { value: "spend", label: "Highest spend" },
];

export function CustomersView({ openAdd }: { openAdd?: boolean }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recent");
  const [segment, setSegment] = useState("all");
  const [data, setData] = useState<Payload | null>(null);
  const [showAdd, setShowAdd] = useState(Boolean(openAdd));
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ q, sort, segment });
    const res = await fetch(`/api/owner/customers?${params}`, { cache: "no-store" });
    setData((await res.json()) as Payload);
    setLoading(false);
  }, [q, sort, segment]);

  useEffect(() => {
    const id = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(id);
  }, [load, q]);

  return (
    <>
      <PageHead
        title="Customers"
        subtitle="Everyone who has been through your chair — automatically kept up to date."
        actions={
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <IconPlus width={15} height={15} />
            Add customer
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <IconSearch
            width={15}
            height={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            className="field pl-9"
            placeholder="Search name or phone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className="field w-auto" value={segment} onChange={(e) => setSegment(e.target.value)}>
          <option value="all">All customers</option>
          <option value="recent">Visited in 30 days</option>
          <option value="frequent">Frequent (4+ visits)</option>
          <option value="inactive">Not seen in 45 days</option>
          <option value="notifications">Notifications on</option>
          <option value="pwa">App installed</option>
        </select>
        <select className="field w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
        {loading && !data ? (
          <div className="space-y-px">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse bg-line/30" />
            ))}
          </div>
        ) : !data || data.customers.length === 0 ? (
          <EmptyState
            title={q ? "No customers match that search" : "No customers yet"}
            hint={
              q
                ? "Try a different name or phone number."
                : "Customers appear here when they join your queue, book online, or when you add them manually."
            }
            icon={<IconUsers width={18} height={18} />}
            action={
              <button className="btn btn-quiet btn-sm" onClick={() => setShowAdd(true)}>
                Add a customer
              </button>
            }
          />
        ) : (
          <>
            <div className="thin-scroll hidden overflow-x-auto md:block">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Last visit</th>
                    <th>Visits</th>
                    <th>Last service</th>
                    <th>Prefers</th>
                    <th>Spend</th>
                    <th>Reachable</th>
                  </tr>
                </thead>
                <tbody>
                  {data.customers.map((c) => (
                    <tr key={c.id} className="cursor-pointer">
                      <td>
                        <Link href={`/dashboard/customers/${c.id}`} className="flex items-center gap-2.5">
                          <Avatar name={c.name} size={30} />
                          <span>
                            <span className="block text-[13.5px] font-medium leading-tight">{c.name}</span>
                            <span className="num block text-[12px] text-muted">{c.phone}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="text-[13px] text-ink-2">
                        {c.lastVisitAt ? sinceLabel(new Date(c.lastVisitAt)) : "—"}
                      </td>
                      <td className="num text-[13px]">{c.totalVisits}</td>
                      <td className="text-[13px] text-ink-2">{c.lastServiceName ?? "—"}</td>
                      <td className="text-[13px] text-ink-2">{c.preferredStaffName ?? "Any"}</td>
                      <td className="num text-[13px]">₹{c.totalSpend.toLocaleString("en-IN")}</td>
                      <td>
                        <div className="flex gap-1">
                          {c.subscribed ? <span className="chip chip-serving">Push</span> : null}
                          {c.marketingOptIn ? <span className="chip chip-info">Offers</span> : null}
                          {c.pwaInstalled ? <span className="chip chip-done">App</span> : null}
                          {!c.subscribed && !c.pwaInstalled ? (
                            <span className="text-[12px] text-faint">Phone only</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden">
              {data.customers.map((c, i) => (
                <Link
                  key={c.id}
                  href={`/dashboard/customers/${c.id}`}
                  className={cx("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-line")}
                >
                  <Avatar name={c.name} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium leading-tight">{c.name}</p>
                    <p className="num truncate text-[12px] text-muted">
                      {c.phone} · {c.totalVisits} visits
                    </p>
                  </div>
                  <span className="text-[12px] text-muted">
                    {c.lastVisitAt ? sinceLabel(new Date(c.lastVisitAt)) : "new"}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      {data ? (
        <p className="mt-3 text-[12.5px] text-muted">
          Showing <span className="num font-medium text-ink-2">{data.customers.length}</span> of{" "}
          <span className="num">{data.segments.all}</span> customers
        </p>
      ) : null}

      <AddCustomer
        open={showAdd}
        staff={data?.staff ?? []}
        onClose={() => setShowAdd(false)}
        onDone={() => {
          setShowAdd(false);
          load();
        }}
      />
    </>
  );
}

function AddCustomer({
  open,
  staff,
  onClose,
  onDone,
}: {
  open: boolean;
  staff: { id: number; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "", preferredStaffId: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm({ name: "", phone: "", email: "", notes: "", preferredStaffId: "" });
  }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      await api("/api/owner/customers", {
        body: { ...form, preferredStaffId: form.preferredStaffId || null },
      });
      toast("Customer saved.");
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save.", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a customer"
      description="If the number already exists we'll update that record instead of creating a duplicate."
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : null} Save customer
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Name">
            <input
              className="field"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </Labeled>
          <Labeled label="Phone">
            <input
              className="field"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Labeled>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Email">
            <input
              className="field"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Labeled>
          <Labeled label="Preferred barber">
            <select
              className="field"
              value={form.preferredStaffId}
              onChange={(e) => setForm({ ...form, preferredStaffId: e.target.value })}
            >
              <option value="">No preference</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Labeled>
        </div>
        <Labeled label="Notes" hint="Preferences, allergies, usual style…">
          <textarea
            className="field min-h-[72px]"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Labeled>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- profile */

type Profile = {
  customer: Row & { birthday: string | null; preferredStaffId: number | null; createdAt: string };
  visits: { id: number; completedAt: string; amount: number; serviceName: string; staffName: string | null; waitMin: number }[];
  upcoming: { id: number; scheduledAt: string; serviceName: string; staffName: string | null; status: string }[];
  inQueue: { id: number; status: string; token: string } | null;
  subscription: { queueOptIn: boolean; bookingOptIn: boolean; marketingOptIn: boolean } | null;
  notifications: { id: number; title: string; type: string; deliveredAt: string }[];
  favouriteServices: { name: string; count: number }[];
  staff: { id: number; name: string }[];
};

export function CustomerProfile({ id }: { id: number }) {
  const [data, setData] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "", preferredStaffId: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/owner/customers/${id}`, { cache: "no-store" });
    const json = (await res.json()) as Profile;
    setData(json);
    setForm({
      name: json.customer.name,
      phone: json.customer.phone,
      email: json.customer.email ?? "",
      notes: json.customer.notes ?? "",
      preferredStaffId: json.customer.preferredStaffId ? String(json.customer.preferredStaffId) : "",
    });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-line/40" />;

  const c = data.customer;

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/owner/customers/${id}`, {
        method: "PATCH",
        body: { ...form, preferredStaffId: form.preferredStaffId || null },
      });
      toast("Customer updated.");
      setEditing(false);
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save.", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link href="/dashboard/customers" className="text-[13px] text-muted hover:text-ink">
        ← All customers
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Avatar name={c.name} size={52} />
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.025em]">{c.name}</h1>
            <p className="num text-[13.5px] text-muted">
              {c.phone}
              {c.email ? ` · ${c.email}` : ""}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {data.inQueue ? <span className="chip chip-waiting">In queue now</span> : null}
              {data.subscription?.queueOptIn ? <span className="chip chip-serving">Queue alerts</span> : null}
              {data.subscription?.marketingOptIn ? <span className="chip chip-info">Offers opted in</span> : null}
              {c.pwaInstalled ? <span className="chip chip-done">App installed</span> : null}
            </div>
          </div>
        </div>
        <button className="btn btn-quiet" onClick={() => setEditing(true)}>
          Edit details
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatTile label="Total visits" value={c.totalVisits} sub={c.lastVisitAt ? `Last ${sinceLabel(new Date(c.lastVisitAt))}` : "No visits yet"} />
        <StatTile label="Total spend" value={`₹${c.totalSpend.toLocaleString("en-IN")}`} sub="Lifetime value" />
        <StatTile label="Loyalty points" value={c.loyaltyPoints} sub="Ready for rewards" accent="clay" />
        <StatTile
          label="Customer since"
          value={new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
          sub={`Joined via ${c.source.replace("_", " ")}`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Visit history" flush>
          {data.visits.length === 0 ? (
            <EmptyState title="No visits recorded yet" hint="Completed services will build this history automatically." />
          ) : (
            data.visits.map((v, i) => (
              <div key={v.id} className={cx("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-line")}>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium">{v.serviceName}</p>
                  <p className="text-[12px] text-muted">
                    {new Date(v.completedAt).toLocaleDateString("en-US", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {v.staffName ? ` · ${v.staffName}` : ""}
                    {v.waitMin ? ` · waited ${v.waitMin}m` : ""}
                  </p>
                </div>
                <span className="num text-[13px] font-medium">₹{v.amount}</span>
              </div>
            ))
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Upcoming">
            {data.upcoming.length === 0 ? (
              <p className="text-[13px] text-muted">No upcoming appointment booked.</p>
            ) : (
              data.upcoming.map((b) => (
                <div key={b.id} className="flex items-center justify-between py-1.5">
                  <div>
                    <p className="text-[13.5px] font-medium">
                      {formatSalonDate(new Date(b.scheduledAt), {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                      {" · "}
                      {formatSalonTime(new Date(b.scheduledAt))}
                    </p>
                    <p className="text-[12px] text-muted">
                      {b.serviceName}
                      {b.staffName ? ` · ${b.staffName}` : ""}
                    </p>
                  </div>
                </div>
              ))
            )}
          </Panel>

          <Panel title="Preferences">
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Preferred barber</dt>
                <dd className="font-medium">{c.preferredStaffName ?? "No preference"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Favourite services</dt>
                <dd className="text-right font-medium">
                  {data.favouriteServices.length
                    ? data.favouriteServices.map((f) => f.name).join(", ")
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Notes</dt>
                <dd className="max-w-[60%] text-right">{c.notes || "—"}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Recent messages" flush>
            {data.notifications.length === 0 ? (
              <p className="px-4 py-4 text-[13px] text-muted">No notifications sent to this customer yet.</p>
            ) : (
              data.notifications.map((n, i) => (
                <div key={n.id} className={cx("px-4 py-2.5", i > 0 && "border-t border-line")}>
                  <p className="text-[13px] font-medium leading-snug">{n.title}</p>
                  <p className="text-[11.5px] text-muted">
                    {n.type} · {sinceLabel(new Date(n.deliveredAt))}
                  </p>
                </div>
              ))
            )}
          </Panel>
        </div>
      </div>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit customer"
        footer={
          <>
            <button className="btn btn-quiet" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? <Spinner /> : null} Save
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Name">
              <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Labeled>
            <Labeled label="Phone">
              <input className="field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Labeled>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Email">
              <input className="field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Labeled>
            <Labeled label="Preferred barber">
              <select
                className="field"
                value={form.preferredStaffId}
                onChange={(e) => setForm({ ...form, preferredStaffId: e.target.value })}
              >
                <option value="">No preference</option>
                {data.staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Labeled>
          </div>
          <Labeled label="Notes">
            <textarea
              className="field min-h-[80px]"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Labeled>
        </div>
      </Modal>
    </>
  );
}
