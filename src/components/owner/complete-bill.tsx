"use client";

import { useState } from "react";
import { api, Labeled, Modal, Spinner, toast } from "@/components/ui";

/** serviceId is null for a custom service typed in by the owner. */
export type ExtraService = { serviceId: number | null; name: string; price: number };

export function rupees(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

/**
 * Completion card shared by appointments and the live queue: the booked service
 * is fixed, extras are added from the menu or typed in, and the bill totals itself.
 * The server re-reads menu prices and records the total once.
 */
export function CompleteBillModal({
  customerName,
  serviceName,
  servicePrice,
  services,
  endpoint,
  successMessage,
  onClose,
  onDone,
}: {
  customerName: string;
  serviceName: string;
  servicePrice: number;
  /** Active menu services that can be added. */
  services: { id: number; name: string; price: number }[];
  /** PATCH endpoint that accepts { action: "complete", extraServices }. */
  endpoint: string;
  successMessage: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [extras, setExtras] = useState<ExtraService[]>([]);
  const [pick, setPick] = useState("");
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [busy, setBusy] = useState(false);

  const extrasTotal = extras.reduce((sum, x) => sum + x.price, 0);
  const total = servicePrice + extrasTotal;

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
      return toast("Enter a whole-rupee amount, like 50.", "err");
    }
    setExtras((list) => [...list, { serviceId: null, name, price }]);
    setCustomName("");
    setCustomPrice("");
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api(endpoint, {
        method: "PATCH",
        body: {
          action: "complete",
          // Menu prices are re-read on the server; only custom amounts are sent.
          extraServices: extras.map((x) => (x.serviceId !== null ? { serviceId: x.serviceId } : { name: x.name, price: x.price })),
        },
      });
      toast(successMessage);
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
      title={`Complete ${customerName}`}
      description="Add any extra services, then confirm the bill."
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
        <section>
          <p className="lbl">Booked service</p>
          <div className="flex items-center justify-between rounded-xl border border-line bg-paper-2 px-3.5 py-2.5">
            <span className="text-[13.5px] font-medium">{serviceName}</span>
            <span className="num text-[13.5px] font-medium">{rupees(servicePrice)}</span>
          </div>
        </section>

        <section>
          <p className="lbl">Additional services</p>
          {extras.length === 0 ? (
            <p className="text-[13px] text-muted">None added yet.</p>
          ) : (
            <div className="rounded-xl border border-line">
              {extras.map((x, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between gap-3 px-3.5 py-2 ${i > 0 ? "border-t border-line" : ""}`}
                >
                  <span className="min-w-0 truncate text-[13.5px]">
                    {x.name}
                    {x.serviceId === null ? <span className="text-muted"> · custom</span> : null}
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
            </div>
          )}

          <div className="mt-3 space-y-3">
            <Labeled label="Add from your menu">
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
                  placeholder="e.g. Head Massage"
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
        </section>

        <section className="rounded-xl border border-line px-3.5 py-2.5">
          <div className="flex justify-between text-[13px] text-muted">
            <span>Booked service</span>
            <span className="num">{rupees(servicePrice)}</span>
          </div>
          <div className="mt-1 flex justify-between text-[13px] text-muted">
            <span>Additional services</span>
            <span className="num">{rupees(extrasTotal)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-line pt-2">
            <span className="text-[14px] font-semibold">Final bill</span>
            <span className="num text-[15px] font-semibold">{rupees(total)}</span>
          </div>
        </section>
      </div>
    </Modal>
  );
}
