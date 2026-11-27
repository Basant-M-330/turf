"use client";

import { useRouter } from "next/navigation";

export function AdminDateFilter({ date }: { date: string }) {
  const router = useRouter();
  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700">Date</label>
      <input
        type="date"
        defaultValue={date}
        onChange={(e) => router.push(`?date=${e.target.value}`)}
        className="mt-1 rounded-md border border-gray-300 px-3 py-2"
      />
    </div>
  );
}
