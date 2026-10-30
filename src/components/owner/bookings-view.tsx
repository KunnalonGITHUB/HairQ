"use client";

import { useEffect, useState } from "react";
import { PageHead } from "@/components/owner/shell";
import { IconCalendar, IconPlus } from "@/components/icons";
import {
  api,
  cx,
  EmptyState,
  Labeled,
  Modal,
  Segmented,
  Spinner,
  StatusChip,
  toast,
  usePoll,
} from "@/components/ui";
import {
  formatSalonTime,
  fromSalonInputValue,
  nextSalonHalfHour,
  relativeSalonDay,
  toSalonInputValue,
} from "@/lib/salon-time";

type Booking = {
  id: number;
  scheduledAt: string;
  durationMin: number;
  status: string;
  source: string;
  notes: string | null;
  customerId: number;
  customerName: string;
  customerPhone: string;
  totalVisits: number;
  serviceName: string;
  servicePrice: number;
  staffName: string | null;
  extraServices: ExtraService[] | null;
  finalAmount: number | null;
};

/** serviceId is null for a custom service. */
type ExtraService = { serviceId: number | null; name: string; price: number };

type Payload = {
  bookings: Booking[];
  counts: { today: number; upcoming: number; completed: number; cancelled: number };
};

type Catalogue = {
  services: { id: number; name: string; durationMin: number; price: number; active?: boolean }[];
  staff: { id: number; name: string; active: boolean }[];
};

type Scope = "today" | "upcoming" | "completed" | "cancelled";

export function BookingsView({ openAdd }: { openAdd?: boolean }) {
  const [scope, setScope] = useState<Scope>("today");
  const { data, refresh } = usePoll<Payload>(`/api/owner/bookings?scope=${scope}`, 15000);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [showAdd, setShowAdd] = useState(Boolean(openAdd));
  const [reschedule, setReschedule] = useState<Booking | null>(null);
  const [completing, setCompleting] = useState<Booking | null>(null);

  useEffect(() => {
    fetch("/api/owner/services", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Catalogue) => setCatalogue(d))
      .catch(() => undefined);
  }, []);

  const act = async (id: number, body: Record<string, unknown>, message: string) => {
    try {
      await api(`/api/owner/bookings/${id}`, { method: "PATCH", body });
      toast(message);
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That didn't work.", "err");
    }
  };

  return (
    <>
      <PageHead
        title="Bookings"
        subtitle="Appointments made online, by phone or at the counter."
        actions={
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <IconPlus width={15} height={15} />
            Add booking
          </button>
        }
      />

      <Segmented
        value={scope}
        onChange={setScope}
        options={[
          { value: "today", label: "Today", count: data?.counts.today },
          { value: "upcoming", label: "Upcoming", count: data?.counts.upcoming },
          { value: "completed", label: "Completed", count: data?.counts.completed },
          { value: "cancelled", label: "Cancelled", count: data?.counts.cancelled },
        ]}
      />

      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
        {!data ? (
          <div className="space-y-px">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse bg-line/30" />
            ))}
          </div>
        ) : data.bookings.length === 0 ? (
          <EmptyState
            title={
              scope === "today"
                ? "Nothing booked for today"
                : scope === "upcoming"
                  ? "No upcoming bookings yet"
                  : scope === "completed"
                    ? "No completed appointments yet"
                    : "No cancellations — nice"
            }
            hint={
              scope === "cancelled"
                ? "Cancelled and no-show appointments will be listed here."
                : "Share your salon link so customers can book a slot themselves, or add one manually."
            }
            icon={<IconCalendar width={18} height={18} />}
            action={
              scope !== "cancelled" ? (
                <button className="btn btn-quiet btn-sm" onClick={() => setShowAdd(true)}>
                  Add a booking
                </button>
              ) : null
            }
          />
        ) : (
          data.bookings.map((b, i) => {
            const at = new Date(b.scheduledAt);
            return (
              <div
                key={b.id}
                className={cx(
                  "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-paper-2",
                  i > 0 && "border-t border-line",
                )}
              >
                <div className="w-[76px] shrink-0">
                  <p className="num text-[15px] font-semibold leading-tight">
                    {formatSalonTime(at)}
                  </p>
                  <p className="text-[11.5px] text-muted">{relativeSalonDay(at)}</p>
                </div>
                <div className="min-w-[140px] flex-1">
                  <p className="truncate text-[14px] font-medium leading-tight">{b.customerName}</p>
                  <p className="num truncate text-[12px] text-muted">
                    {b.customerPhone} · {b.totalVisits} visit{b.totalVisits === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="min-w-[130px]">
                  <p className="text-[13px] font-medium">{b.serviceName}</p>
                  <p className="num text-[12px] text-muted">
                    {b.durationMin} min · {b.staffName ?? "Any barber"}
                  </p>
                  {b.status === "completed" && b.finalAmount !== null ? (
                    <p className="num text-[12px] text-muted">
                      {b.extraServices?.length ? `+ ${b.extraServices.map((x) => x.name).join(", ")} · ` : ""}
                      {rupees(b.finalAmount)} total
                    </p>
                  ) : null}
                </div>
                <StatusChip status={b.status} />
                <div className="flex flex-wrap items-center gap-1.5">
                  {b.status === "confirmed" ? (
                    <>
                      <button className="btn btn-quiet btn-sm" onClick={() => act(b.id, { action: "arrive" }, `${b.customerName} marked arrived.`)}>
                        Arrived
                      </button>
                      <button
                        className="btn btn-quiet btn-sm"
                        onClick={() => act(b.id, { action: "add_to_queue" }, `${b.customerName} added to the live queue.`)}
                      >
                        To queue
                      </button>
                    </>
                  ) : null}
                  {b.status === "arrived" ? (
                    <button
                      className="btn btn-quiet btn-sm"
                      onClick={() => act(b.id, { action: "add_to_queue" }, `${b.customerName} added to the live queue.`)}
                    >
                      To queue
                    </button>
                  ) : null}
                  {["confirmed", "arrived"].includes(b.status) ? (
                    <>
                      <button className="btn btn-quiet btn-sm" onClick={() => setReschedule(b)}>
                        Move
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={() => setCompleting(b)}>
                        Complete
                      </button>
                      <button
                        className="btn btn-ghost btn-sm text-rose"
                        onClick={() => act(b.id, { action: "cancel" }, "Appointment cancelled.")}
                      >
                        Cancel
                      </button>
                    </>
                  ) : null}
                  {b.status === "cancelled" ? (
                    <button className="btn btn-quiet btn-sm" onClick={() => setReschedule(b)}>
                      Rebook
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      <AddBooking
        open={showAdd}
        catalogue={catalogue}
        onClose={() => setShowAdd(false)}
        onDone={() => {
          setShowAdd(false);
          refresh();
        }}
      />

      <CompleteModal
        key={completing?.id ?? "none"}
        booking={completing}
        services={(catalogue?.services ?? []).filter((s) => s.active !== false)}
        onClose={() => setCompleting(null)}
        onDone={() => {
          setCompleting(null);
          refresh();
        }}
      />

      <RescheduleModal
        booking={reschedule}
        onClose={() => setReschedule(null)}
        onDone={() => {
          setReschedule(null);
          refresh();
        }}
      />
    </>
  );
}

/** The date-time pickers always show and accept salon (Asia/Kolkata) time. */
function toLocalInput(date: Date) {
  return toSalonInputValue(date);
}

function AddBooking({
  open,
  catalogue,
  onClose,
  onDone,
}: {
  open: boolean;
  catalogue: Catalogue | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceId, setServiceId] = useState<number | "">("");
  const [staffId, setStaffId] = useState<number | "">("");
  const [when, setWhen] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      // An hour from now, rounded up to the next :00 / :30 so the default is a valid slot.
      const next = nextSalonHalfHour(new Date(Date.now() + 60 * 60000));
      setWhen(toLocalInput(next));
      setName("");
      setPhone("");
      setNotes("");
      setServiceId(catalogue?.services[0]?.id ?? "");
      setStaffId("");
    }
  }, [open, catalogue]);

  const submit = async () => {
    setBusy(true);
    try {
      await api("/api/owner/bookings", {
        body: {
          name,
          phone,
          serviceId: serviceId || null,
          staffId: staffId || null,
          scheduledAt: fromSalonInputValue(when)?.toISOString() ?? "",
          notes,
        },
      });
      toast("Booking added.");
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save the booking.", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a booking"
      description="For phone calls and counter bookings."
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : null} Save booking
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
            <input className="field" value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} />
          </Labeled>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Service">
            <select className="field" value={serviceId} onChange={(e) => setServiceId(Number(e.target.value))}>
              {catalogue?.services.map((s) => (
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
              {catalogue?.staff
                .filter((s) => s.active)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Labeled>
        </div>
        <Labeled label="Date & time">
          <input type="datetime-local" step={1800} className="field" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Labeled>
        <Labeled label="Notes">
          <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Labeled>
      </div>
    </Modal>
  );
}

function RescheduleModal({
  booking,
  onClose,
  onDone,
}: {
  booking: Booking | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (booking) setWhen(toLocalInput(new Date(booking.scheduledAt)));
  }, [booking]);

  if (!booking) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await api(`/api/owner/bookings/${booking.id}`, {
        method: "PATCH",
        body: { action: "reschedule", scheduledAt: fromSalonInputValue(when)?.toISOString() ?? "" },
      });
      toast("Appointment moved — the customer has been notified.");
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't move it.", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Move ${booking.customerName}'s appointment`}
      description={`${booking.serviceName} · ${booking.durationMin} min`}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose}>
            Keep as is
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : null} Save new time
          </button>
        </>
      }
    >
      <Labeled label="New date & time">
        <input type="datetime-local" step={1800} className="field" value={when} onChange={(e) => setWhen(e.target.value)} />
      </Labeled>
    </Modal>
  );
}

function rupees(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

/** Review the bill before completing: booked service, extras, and the final total. */
function CompleteModal({
  booking,
  services,
  onClose,
  onDone,
}: {
  booking: Booking | null;
  services: Catalogue["services"];
  onClose: () => void;
  onDone: () => void;
}) {
  const [extras, setExtras] = useState<ExtraService[]>([]);
  const [pick, setPick] = useState("");
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [busy, setBusy] = useState(false);

  if (!booking) return null;

  const total = booking.servicePrice + extras.reduce((sum, x) => sum + x.price, 0);

  const addService = () => {
    const service = services.find((s) => s.id === Number(pick));
    if (!service) return;
    setExtras((list) => [...list, { serviceId: service.id, name: service.name, price: service.price }]);
    setPick("");
  };

  const addCustom = () => {
    const name = customName.trim();
    const price = Number(customPrice);
    if (!name) return toast("Give the custom service a name.", "err");
    if (customPrice.trim() === "" || !Number.isInteger(price) || price < 0) {
      return toast("Enter a whole-rupee amount, like 150.", "err");
    }
    setExtras((list) => [...list, { serviceId: null, name, price }]);
    setCustomName("");
    setCustomPrice("");
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api(`/api/owner/bookings/${booking.id}`, {
        method: "PATCH",
        body: {
          action: "complete",
          // Catalogue prices are re-read on the server; only custom amounts are sent.
          extraServices: extras.map((x) => (x.serviceId !== null ? { serviceId: x.serviceId } : { name: x.name, price: x.price })),
        },
      });
      toast("Appointment completed.");
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't complete it.", "err");
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Complete ${booking.customerName}'s appointment`}
      description="Add anything else you did before saving the bill."
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : null} Complete · {rupees(total)}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-line">
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <span className="text-[13.5px]">
              {booking.serviceName} <span className="text-muted">· booked</span>
            </span>
            <span className="num text-[13.5px] font-medium">{rupees(booking.servicePrice)}</span>
          </div>
          {extras.map((x, i) => (
            <div key={i} className="flex items-center justify-between gap-3 border-t border-line px-3.5 py-2.5">
              <span className="min-w-0 truncate text-[13.5px]">
                {x.name} <span className="text-muted">· {x.serviceId === null ? "custom" : "added"}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="num text-[13.5px] font-medium">{rupees(x.price)}</span>
                <button
                  className="btn btn-ghost btn-sm text-rose"
                  onClick={() => setExtras((list) => list.filter((_, j) => j !== i))}
                  aria-label={`Remove ${x.name}`}
                >
                  Remove
                </button>
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-line bg-paper-2 px-3.5 py-2.5">
            <span className="text-[13.5px] font-semibold">Total</span>
            <span className="num text-[15px] font-semibold">{rupees(total)}</span>
          </div>
        </div>

        <Labeled label="Add a service from your menu">
          <div className="flex gap-2">
            <select className="field" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose a service</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {rupees(s.price)}
                </option>
              ))}
            </select>
            <button className="btn btn-quiet" onClick={addService} disabled={!pick}>
              Add
            </button>
          </div>
        </Labeled>

        <Labeled label="Or add a custom service">
          <div className="flex gap-2">
            <input
              className="field min-w-0 flex-1"
              placeholder="Service name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
            <input
              className="field w-28"
              placeholder="₹ Amount"
              inputMode="numeric"
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
            />
            <button className="btn btn-quiet" onClick={addCustom}>
              Add
            </button>
          </div>
        </Labeled>
      </div>
    </Modal>
  );
}
