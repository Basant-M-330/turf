"use client";

import { useEffect, useState } from "react";
import { todayDateString } from "@/lib/format";

interface BlockedSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string | null;
}

export function BlockedSlotsManager({ courts }: { courts: { id: string; name: string }[] }) {
  const [courtId, setCourtId] = useState(courts[0]?.id ?? "");
  const [date, setDate] = useState(todayDateString());
  const [blocked, setBlocked] = useState<BlockedSlot[]>([]);
  const [form, setForm] = useState({ startTime: "09:00", reason: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!courtId) return;
    fetch(`/api/admin/blocked-slots?courtId=${courtId}&date=${date}`)
      .then((res) => res.json())
      .then(setBlocked);
  }, [courtId, date]);

  async function addBlock(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/blocked-slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courtId, date, startTime: form.startTime, reason: form.reason || undefined }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not block this slot");
      return;
    }
    setBlocked([...blocked, data]);
  }

  async function removeBlock(id: string) {
    await fetch(`/api/admin/blocked-slots/${id}`, { method: "DELETE" });
    setBlocked(blocked.filter((b) => b.id !== id));
  }

  if (courts.length === 0) {
    return <p className="text-sm text-gray-600">Add a court first.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Court</label>
          <select
            value={courtId}
            onChange={(e) => setCourtId(e.target.value)}
            className="mt-1 rounded-md border border-gray-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 rounded-md border border-gray-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div className="space-y-2">
        {blocked.length === 0 ? (
          <p className="text-sm text-gray-500">No blocked slots on this date.</p>
        ) : (
          blocked.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-4 py-2">
              <span className="text-sm text-gray-700">
                {b.startTime} - {b.endTime}
                {b.reason ? ` · ${b.reason}` : ""}
              </span>
              <button onClick={() => removeBlock(b.id)} className="text-sm text-red-600 hover:text-red-800">
                Unblock
              </button>
            </div>
          ))
        )}
      </div>

      <form onSubmit={addBlock} className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Start time</label>
          <input
            type="time"
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            className="mt-1 rounded-md border border-gray-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Reason (optional)</label>
          <input
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            className="mt-1 rounded-md border border-gray-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? "Blocking..." : "Block slot"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
