"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BookingCancelButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function cancel() {
    if (!confirm("Cancel this booking?")) return;
    setLoading(true);
    await fetch(`/api/bookings/${bookingId}/cancel`, { method: "POST" });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={cancel}
      disabled={loading}
      className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
    >
      {loading ? "Cancelling..." : "Cancel"}
    </button>
  );
}
