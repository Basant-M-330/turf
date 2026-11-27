"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SPORTS = ["FOOTBALL", "CRICKET", "BADMINTON", "TENNIS", "BASKETBALL", "OTHER"];

export function CreateCourtForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    sportType: "FOOTBALL",
    description: "",
    slotDurationMinutes: 60,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/courts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not create court");
      return;
    }
    router.push(`/admin/courts/${data.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="block text-sm font-medium text-gray-700">Name</label>
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Sport</label>
        <select
          value={form.sportType}
          onChange={(e) => setForm({ ...form, sportType: e.target.value })}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
        >
          {SPORTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Slot duration (minutes)</label>
        <input
          type="number"
          min={15}
          max={240}
          step={15}
          value={form.slotDurationMinutes}
          onChange={(e) => setForm({ ...form, slotDurationMinutes: Number(e.target.value) })}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-gray-700">Description (optional)</label>
        <input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </div>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-fit rounded-md bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-50 sm:col-span-2"
      >
        {loading ? "Creating..." : "Create court"}
      </button>
    </form>
  );
}
