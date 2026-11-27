import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarX, Clock3 } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatRupees } from "@/lib/format";
import { BookingCancelButton } from "@/components/booking-cancel-button";
import { StatusPill } from "@/components/status-pill";

export default async function MyBookingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/my-bookings");

  const bookings = await prisma.booking.findMany({
    where: { userId: session.user.id, status: { not: "EXPIRED" } },
    include: { court: true },
    orderBy: [{ date: "desc" }, { startTime: "desc" }],
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">My bookings</h1>
      {bookings.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CalendarX className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm text-gray-600">You haven&apos;t booked any slots yet.</p>
          <Link
            href="/"
            className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
          >
            Book a slot
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div>
                <p className="font-medium text-gray-900">{b.court.name}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-500">
                  <Clock3 className="h-3.5 w-3.5" />
                  {b.date} · {b.startTime} - {b.endTime}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <StatusPill status={b.status} />
                  <span className="text-sm text-gray-500">
                    {formatRupees(b.paidAmount)} / {formatRupees(b.totalAmount)} paid
                  </span>
                </div>
              </div>
              {(b.status === "CONFIRMED" || b.status === "PARTIALLY_PAID" || b.status === "HOLD") && (
                <BookingCancelButton bookingId={b.id} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
