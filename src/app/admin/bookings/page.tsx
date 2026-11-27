import { prisma } from "@/lib/prisma";
import { formatRupees, todayDateString } from "@/lib/format";
import { AdminBookingActions } from "@/components/admin-booking-actions";
import { AdminDateFilter } from "@/components/admin-date-filter";
import { StatusPill } from "@/components/status-pill";

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const selectedDate = date || todayDateString();

  const bookings = await prisma.booking.findMany({
    where: { date: selectedDate, status: { not: "EXPIRED" } },
    include: { court: true, user: { select: { name: true, phone: true, email: true } } },
    orderBy: { startTime: "asc" },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Bookings</h1>
      <AdminDateFilter date={selectedDate} />

      {bookings.length === 0 ? (
        <p className="text-sm text-gray-600">No bookings on this date.</p>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <div key={b.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {b.court.name} · {b.startTime} - {b.endTime}
                  </p>
                  <p className="text-sm text-gray-500">
                    {b.user.name} · {b.user.phone ?? b.user.email}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <StatusPill status={b.status} />
                    <span className="text-sm text-gray-500">
                      {formatRupees(b.paidAmount)} / {formatRupees(b.totalAmount)} ·{" "}
                      {b.paymentType?.replace("_", " ") ?? "—"}
                    </span>
                  </div>
                </div>
                <AdminBookingActions
                  bookingId={b.id}
                  status={b.status}
                  paymentType={b.paymentType}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
