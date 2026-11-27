"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Timer, XCircle } from "lucide-react";
import { formatRupees } from "@/lib/format";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

interface Booking {
  id: string;
  status: "HOLD" | "CONFIRMED" | "PARTIALLY_PAID" | "CANCELLED" | "EXPIRED" | "COMPLETED";
  date: string;
  startTime: string;
  endTime: string;
  totalAmount: number;
  paidAmount: number;
  expiresAt: string | null;
  court: { id: string; name: string };
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById("razorpay-checkout-js")) return resolve();
    const script = document.createElement("script");
    script.id = "razorpay-checkout-js";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Razorpay checkout"));
    document.body.appendChild(script);
  });
}

export function CheckoutFlow({
  bookingId,
  multiCourtEnabled,
}: {
  bookingId: string;
  multiCourtEnabled: boolean;
}) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<"FULL" | "PARTIAL" | "VENUE" | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(() => {
    fetch(`/api/bookings/${bookingId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setBooking(data);
      });
  }, [bookingId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remainingSeconds = useMemo(() => {
    if (!booking?.expiresAt) return 0;
    return Math.max(0, Math.floor((new Date(booking.expiresAt).getTime() - now) / 1000));
  }, [booking, now]);

  const expired = booking?.status === "HOLD" && remainingSeconds <= 0;

  async function payAtVenue() {
    setProcessing("VENUE");
    setError(null);
    const res = await fetch(`/api/bookings/${bookingId}/pay-at-venue`, { method: "POST" });
    const data = await res.json();
    setProcessing(null);
    if (!res.ok) {
      setError(data.error ?? "Could not confirm booking");
      return;
    }
    refresh();
  }

  async function payOnline(paymentType: "FULL" | "PARTIAL") {
    setProcessing(paymentType);
    setError(null);
    try {
      const orderRes = await fetch(`/api/bookings/${bookingId}/payment/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentType }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok) throw new Error(order.error ?? "Could not start payment");

      await loadRazorpayScript();

      const razorpay = new window.Razorpay({
        key: order.keyId,
        amount: order.amount * 100,
        currency: order.currency,
        order_id: order.orderId,
        name: "Turf Booking",
        description: `${booking?.court.name} · ${booking?.date} ${booking?.startTime}`,
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          const verifyRes = await fetch(`/api/bookings/${bookingId}/payment/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            }),
          });
          if (!verifyRes.ok) {
            setError("Payment verification failed. Please contact support.");
          }
          refresh();
        },
        modal: {
          ondismiss: () => setProcessing(null),
        },
      });
      razorpay.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setProcessing(null);
    }
  }

  if (error && !booking) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (!booking) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  if (booking.status === "CONFIRMED" || booking.status === "PARTIALLY_PAID" || booking.status === "COMPLETED") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          <h1 className="text-lg font-semibold text-emerald-900">Booking confirmed</h1>
        </div>
        <p className="mt-2 text-sm text-emerald-800">
          {booking.court.name} on {booking.date} from {booking.startTime} to {booking.endTime}.
        </p>
        <p className="mt-1 text-sm text-emerald-800">
          Paid {formatRupees(booking.paidAmount)} of {formatRupees(booking.totalAmount)}.
        </p>
        <Link href="/my-bookings" className="mt-4 inline-block text-sm font-medium text-emerald-900 underline">
          View my bookings
        </Link>
      </div>
    );
  }

  if (booking.status === "CANCELLED" || booking.status === "EXPIRED" || expired) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <XCircle className="h-6 w-6 text-gray-400" />
          <h1 className="text-lg font-semibold text-gray-900">This hold has expired</h1>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          The slot wasn&apos;t confirmed in time and has been released back for others to book.
        </p>
        <Link
          href={multiCourtEnabled ? `/courts/${booking.court.id}` : "/"}
          className="mt-4 inline-block text-sm font-medium text-emerald-700 underline"
        >
          Pick another slot
        </Link>
      </div>
    );
  }

  const minutes = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
  const seconds = String(remainingSeconds % 60).padStart(2, "0");

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-gray-900">{booking.court.name}</h1>
      <p className="text-sm text-gray-600">
        {booking.date} · {booking.startTime} - {booking.endTime}
      </p>
      <p className="mt-2 text-xl font-semibold text-emerald-700">{formatRupees(booking.totalAmount)}</p>

      <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <Timer className="h-4 w-4 shrink-0" />
        Slot held for <span className="font-mono font-semibold">{minutes}:{seconds}</span> — complete your booking
        before it expires.
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-6 space-y-3">
        <button
          onClick={() => payOnline("FULL")}
          disabled={processing !== null}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {processing === "FULL" ? "Processing..." : `Pay full amount (${formatRupees(booking.totalAmount)})`}
        </button>
        <button
          onClick={() => payOnline("PARTIAL")}
          disabled={processing !== null}
          className="w-full rounded-lg border border-emerald-600 px-4 py-2 text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
        >
          {processing === "PARTIAL" ? "Processing..." : "Pay a partial deposit online"}
        </button>
        <button
          onClick={payAtVenue}
          disabled={processing !== null}
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
        >
          {processing === "VENUE" ? "Confirming..." : "Pay at venue"}
        </button>
      </div>
    </div>
  );
}
