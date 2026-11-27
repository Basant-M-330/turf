"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Court, OperatingHours, PricingRule } from "@prisma/client";
import { formatRupees } from "@/lib/format";
import { ImageManager } from "@/components/image-manager";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;

type CourtWithRelations = Court & { operatingHours: OperatingHours[]; pricingRules: PricingRule[] };

export function CourtEditor({ court }: { court: CourtWithRelations }) {
  const router = useRouter();
  const [isActive, setIsActive] = useState(court.isActive);
  const [savingActive, setSavingActive] = useState(false);

  async function toggleActive() {
    setSavingActive(true);
    await fetch(`/api/admin/courts/${court.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    setIsActive(!isActive);
    setSavingActive(false);
    router.refresh();
  }

  const [hours, setHours] = useState(
    DAYS.map((day) => {
      const existing = court.operatingHours.find((h) => h.dayOfWeek === day);
      return {
        day,
        open: Boolean(existing),
        openTime: existing?.openTime ?? "09:00",
        closeTime: existing?.closeTime ?? "22:00",
      };
    })
  );
  const [savingHours, setSavingHours] = useState(false);

  async function saveHours() {
    setSavingHours(true);
    await fetch(`/api/admin/courts/${court.id}/operating-hours`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hours: hours
          .filter((h) => h.open)
          .map((h) => ({ dayOfWeek: h.day, openTime: h.openTime, closeTime: h.closeTime })),
      }),
    });
    setSavingHours(false);
    router.refresh();
  }

  const [pricingForm, setPricingForm] = useState({
    dayType: "WEEKDAY",
    startTime: "09:00",
    endTime: "17:00",
    pricePerSlot: 500,
  });
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);

  async function addPricingRule(e: React.FormEvent) {
    e.preventDefault();
    setSavingPricing(true);
    setPricingError(null);
    const res = await fetch(`/api/admin/courts/${court.id}/pricing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pricingForm),
    });
    setSavingPricing(false);
    if (!res.ok) {
      const data = await res.json();
      setPricingError(data.error ?? "Could not add pricing rule");
      return;
    }
    router.refresh();
  }

  async function deletePricingRule(id: string) {
    await fetch(`/api/admin/pricing/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-medium text-gray-900">Photos</h2>
        <ImageManager courtId={court.id} initialImages={court.images} />
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium text-gray-900">Status</h2>
            <p className="text-sm text-gray-500">Inactive hides the venue from customers.</p>
          </div>
          <button
            onClick={toggleActive}
            disabled={savingActive}
            className={`rounded-md px-4 py-2 text-sm text-white disabled:opacity-50 ${
              isActive ? "bg-gray-700 hover:bg-gray-800" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {isActive ? "Deactivate" : "Activate"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-medium text-gray-900">Operating hours</h2>
        <div className="space-y-2">
          {hours.map((h, i) => (
            <div key={h.day} className="flex items-center gap-3">
              <label className="flex w-32 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={h.open}
                  onChange={(e) => {
                    const next = [...hours];
                    next[i] = { ...h, open: e.target.checked };
                    setHours(next);
                  }}
                />
                {h.day.slice(0, 3)}
              </label>
              <input
                type="time"
                disabled={!h.open}
                value={h.openTime}
                onChange={(e) => {
                  const next = [...hours];
                  next[i] = { ...h, openTime: e.target.value };
                  setHours(next);
                }}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
              />
              <span className="text-gray-400">to</span>
              <input
                type="time"
                disabled={!h.open}
                value={h.closeTime}
                onChange={(e) => {
                  const next = [...hours];
                  next[i] = { ...h, closeTime: e.target.value };
                  setHours(next);
                }}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
              />
            </div>
          ))}
        </div>
        <button
          onClick={saveHours}
          disabled={savingHours}
          className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {savingHours ? "Saving..." : "Save hours"}
        </button>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-medium text-gray-900">Pricing rules</h2>
        <div className="mb-4 space-y-2">
          {court.pricingRules.length === 0 && <p className="text-sm text-gray-500">No pricing rules yet.</p>}
          {court.pricingRules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2">
              <span className="text-sm text-gray-700">
                {rule.dayType} · {rule.startTime} - {rule.endTime} · {formatRupees(rule.pricePerSlot)}
              </span>
              <button onClick={() => deletePricingRule(rule.id)} className="text-sm text-red-600 hover:text-red-800">
                Remove
              </button>
            </div>
          ))}
        </div>

        <form onSubmit={addPricingRule} className="grid gap-3 sm:grid-cols-4">
          <select
            value={pricingForm.dayType}
            onChange={(e) => setPricingForm({ ...pricingForm, dayType: e.target.value })}
            className="rounded-md border border-gray-300 px-2 py-2 text-sm"
          >
            <option value="WEEKDAY">Weekday</option>
            <option value="WEEKEND">Weekend</option>
          </select>
          <input
            type="time"
            value={pricingForm.startTime}
            onChange={(e) => setPricingForm({ ...pricingForm, startTime: e.target.value })}
            className="rounded-md border border-gray-300 px-2 py-2 text-sm"
          />
          <input
            type="time"
            value={pricingForm.endTime}
            onChange={(e) => setPricingForm({ ...pricingForm, endTime: e.target.value })}
            className="rounded-md border border-gray-300 px-2 py-2 text-sm"
          />
          <input
            type="number"
            min={1}
            value={pricingForm.pricePerSlot}
            onChange={(e) => setPricingForm({ ...pricingForm, pricePerSlot: Number(e.target.value) })}
            className="rounded-md border border-gray-300 px-2 py-2 text-sm"
            placeholder="Price per slot"
          />
          {pricingError && <p className="text-sm text-red-600 sm:col-span-4">{pricingError}</p>}
          <button
            type="submit"
            disabled={savingPricing}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50 sm:col-span-4 sm:w-fit"
          >
            {savingPricing ? "Adding..." : "Add pricing rule"}
          </button>
        </form>
      </section>
    </div>
  );
}
