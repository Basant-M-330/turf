"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { CalendarDays } from "lucide-react";
import { formatRupees, todayDateString } from "@/lib/format";
import { MAX_DURATION_SLOTS } from "@/lib/validations/booking";

interface Slot {
  startTime: string;
  endTime: string;
  price: number;
  status: "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";
}

const STATUS_STYLES: Record<Slot["status"], string> = {
  AVAILABLE: "border-gray-200 bg-white hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-md",
  HELD: "border-amber-200 bg-amber-50 text-amber-700 cursor-not-allowed",
  BOOKED: "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed",
  BLOCKED: "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed",
};

const STATUS_LABEL: Record<Slot["status"], string> = {
  AVAILABLE: "Available",
  HELD: "On hold",
  BOOKED: "Booked",
  BLOCKED: "Unavailable",
};

export function CourtBooking({ courtId }: { courtId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const [date, setDate] = useState(todayDateString());
  const [slotsData, setSlotsData] = useState<{ date: string; slots: Slot[] }>({ date: "", slots: [] });
  const [error, setError] = useState<string | null>(null);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [duration, setDuration] = useState(1);
  const [holding, setHolding] = useState(false);

  const loading = slotsData.date !== date;
  const slots = useMemo(() => (loading ? [] : slotsData.slots), [loading, slotsData.slots]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/courts/${courtId}/availability?date=${date}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setSlotsData({ date, slots: data.slots ?? [] });
      });
    return () => {
      cancelled = true;
    };
  }, [courtId, date]);

  const selectedIndex = slots.findIndex((s) => s.startTime === selectedStart);

  const maxDuration = useMemo(() => {
    if (selectedIndex === -1) return 0;
    let count = 0;
    for (let i = selectedIndex; i < slots.length && count < MAX_DURATION_SLOTS; i++) {
      if (slots[i].status !== "AVAILABLE") break;
      count++;
    }
    return count;
  }, [slots, selectedIndex]);

  function selectSlot(slot: Slot) {
    setError(null);
    if (selectedStart === slot.startTime) {
      setSelectedStart(null);
      return;
    }
    setSelectedStart(slot.startTime);
    setDuration(1);
  }

  async function holdSelection() {
    if (!session?.user) {
      router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
      return;
    }
    if (selectedIndex === -1) return;

    setHolding(true);
    setError(null);
    const res = await fetch("/api/bookings/hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courtId, date, startTime: slots[selectedIndex].startTime, durationSlots: duration }),
    });
    const data = await res.json();
    setHolding(false);
    if (!res.ok) {
      setError(data.error ?? "Could not hold this time range");
      setSelectedStart(null);
      return;
    }
    router.push(`/checkout/${data.bookingId}`);
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">Date</label>
      <div className="relative mt-1 w-fit">
        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
        <input
          type="date"
          value={date}
          min={todayDateString()}
          onChange={(e) => {
            setDate(e.target.value);
            setSelectedStart(null);
          }}
          className="rounded-full border border-gray-300 py-2 pl-9 pr-4 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border border-gray-200 bg-white" /> Available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" /> On hold
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300" /> Booked
        </span>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-6">
        {loading ? (
          <div className="grid animate-pulse grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-[72px] rounded-xl border border-gray-100 bg-gray-50" />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <p className="text-sm text-gray-500">This court isn&apos;t open on the selected date.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {slots.map((slot, i) => {
              const inSelection = selectedIndex !== -1 && i >= selectedIndex && i < selectedIndex + duration;
              return (
                <button
                  key={slot.startTime}
                  disabled={slot.status !== "AVAILABLE" || holding}
                  onClick={() => selectSlot(slot)}
                  className={`rounded-xl border px-3 py-3 text-left text-sm transition ${STATUS_STYLES[slot.status]} ${
                    inSelection ? "border-emerald-500 ring-2 ring-emerald-500" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-gray-900">
                      {slot.startTime} - {slot.endTime}
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">
                      {formatRupees(slot.price)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{STATUS_LABEL[slot.status]}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedIndex !== -1 && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">How long do you want to play?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {Array.from({ length: maxDuration }, (_, n) => n + 1).map((n) => {
              const rangeEnd = slots[selectedIndex + n - 1]?.endTime;
              const price = slots.slice(selectedIndex, selectedIndex + n).reduce((sum, s) => sum + s.price, 0);
              return (
                <button
                  key={n}
                  onClick={() => setDuration(n)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    duration === n
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-emerald-300 bg-white text-emerald-800 hover:border-emerald-500"
                  }`}
                >
                  {slots[selectedIndex].startTime}–{rangeEnd} · {formatRupees(price)}
                </button>
              );
            })}
          </div>
          <button
            onClick={holdSelection}
            disabled={holding}
            className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
          >
            {holding ? "Holding..." : "Continue to checkout"}
          </button>
        </div>
      )}
    </div>
  );
}
