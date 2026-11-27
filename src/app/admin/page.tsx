import Link from "next/link";
import { CalendarCheck, ClipboardList, ImageIcon, ShieldOff, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { todayDateString } from "@/lib/format";
import { multiCourtEnabled } from "@/lib/config";

export default async function AdminDashboard() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const today = todayDateString();

  const todaysBookings = await prisma.booking.count({
    where: { date: today, status: { in: ["CONFIRMED", "PARTIALLY_PAID", "COMPLETED"] } },
  });

  const cardClass =
    "rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-emerald-400 hover:shadow-md";

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-gray-900">Admin</h1>
      <p className="mb-6 text-sm text-gray-600">
        {todaysBookings} booking{todaysBookings === 1 ? "" : "s"} today.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/admin/bookings" className={cardClass}>
          <CalendarCheck className="h-5 w-5 text-emerald-600" />
          <h2 className="mt-2 font-medium text-gray-900">Bookings</h2>
          <p className="text-sm text-gray-500">View, cancel, and mark pay-at-venue bookings as paid.</p>
        </Link>
        <Link href="/admin/blocked-slots" className={cardClass}>
          <ShieldOff className="h-5 w-5 text-emerald-600" />
          <h2 className="mt-2 font-medium text-gray-900">Blocked slots</h2>
          <p className="text-sm text-gray-500">Block slots for maintenance or private events.</p>
        </Link>
        {isAdmin && (
          <>
            <Link href={multiCourtEnabled ? "/admin/courts" : "/admin/venue"} className={cardClass}>
              <ImageIcon className="h-5 w-5 text-emerald-600" />
              <h2 className="mt-2 font-medium text-gray-900">{multiCourtEnabled ? "Courts & pricing" : "Venue & pricing"}</h2>
              <p className="text-sm text-gray-500">
                {multiCourtEnabled ? "Manage courts, hours, pricing, and photos." : "Manage hours, pricing, and photos."}
              </p>
            </Link>
            <Link href="/admin/staff" className={cardClass}>
              <Users className="h-5 w-5 text-emerald-600" />
              <h2 className="mt-2 font-medium text-gray-900">Staff accounts</h2>
              <p className="text-sm text-gray-500">Add or remove staff and admin access.</p>
            </Link>
            <Link href="/admin/audit-log" className={cardClass}>
              <ClipboardList className="h-5 w-5 text-emerald-600" />
              <h2 className="mt-2 font-medium text-gray-900">Audit log</h2>
              <p className="text-sm text-gray-500">See who changed pricing, staff, or bookings.</p>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
