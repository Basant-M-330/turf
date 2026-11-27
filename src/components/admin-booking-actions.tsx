"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminBookingActions({
  bookingId,
  status,
  paymentType,
}: {
  bookingId: string;
  status: string;
  paymentType: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"paid" | "cancel" | null>(null);

  async function markPaid() {
    setLoading("paid");
    await fetch(`/api/admin/bookings/${bookingId}/mark-paid`, { method: "POST" });
    setLoading(null);
    router.refresh();
  }

  async function cancel() {
    if (!confirm("Cancel this booking?")) return;
    setLoading("cancel");
    await fetch(`/api/bookings/${bookingId}/cancel`, { method: "POST" });
    setLoading(null);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      {paymentType === "PAY_AT_VENUE" && status === "CONFIRMED" && (
        <button
          onClick={markPaid}
          disabled={loading !== null}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading === "paid" ? "Marking..." : "Mark paid"}
        </button>
      )}
      {(status === "CONFIRMED" || status === "PARTIALLY_PAID" || status === "HOLD") && (
        <button
          onClick={cancel}
          disabled={loading !== null}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {loading === "cancel" ? "Cancelling..." : "Cancel"}
        </button>
      )}
    </div>
  );
}
