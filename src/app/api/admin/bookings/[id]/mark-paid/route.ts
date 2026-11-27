import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isStaffOrAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

/** Front-desk staff confirm a pay-at-venue booking's payment was collected on arrival. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isStaffOrAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.paymentType !== "PAY_AT_VENUE" || booking.status !== "CONFIRMED") {
    return NextResponse.json({ error: "Only confirmed pay-at-venue bookings can be marked paid" }, { status: 409 });
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: { status: "COMPLETED", paidAmount: booking.totalAmount },
  });
  await logAudit({ actorId: session!.user.id, action: "booking.mark-paid", targetType: "Booking", targetId: id });
  return NextResponse.json(updated);
}
