import { redirect } from "next/navigation";
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
        <p className="text-sm text-gray-600">You haven&apos;t booked any slots yet.</p>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div>
                <p className="font-medium text-gray-900">{b.court.name}</p>
                <p className="text-sm text-gray-500">
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
