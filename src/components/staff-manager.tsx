"use client";

import { useState } from "react";

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: "STAFF" | "ADMIN" | "CUSTOMER";
}

export function StaffManager({
  initialStaff,
  currentUserId,
}: {
  initialStaff: StaffUser[];
  currentUserId: string;
}) {
  const [staff, setStaff] = useState(initialStaff);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "STAFF" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not create account");
      return;
    }
    setStaff([...staff, data]);
    setForm({ name: "", email: "", password: "", role: "STAFF" });
  }

  async function removeStaff(id: string) {
    if (!confirm("Remove this account's staff/admin access?")) return;
    await fetch(`/api/admin/staff/${id}`, { method: "DELETE" });
    setStaff(staff.filter((s) => s.id !== id));
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        {staff.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white shadow-sm p-4">
            <div>
              <p className="font-medium text-gray-900">{s.name}</p>
              <p className="text-sm text-gray-500">
                {s.email} · {s.role}
              </p>
            </div>
            {s.id !== currentUserId && (
              <button onClick={() => removeStaff(s.id)} className="text-sm text-red-600 hover:text-red-800">
                Remove access
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
        <h2 className="mb-4 font-medium text-gray-900">Add staff or admin</h2>
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <input
            placeholder="Name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <input
            type="email"
            placeholder="Email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <input
            type="password"
            placeholder="Password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="STAFF">Staff</option>
            <option value="ADMIN">Admin</option>
          </select>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-fit rounded-md bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-50 sm:col-span-2"
          >
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
