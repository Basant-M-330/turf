import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { releaseSlotLockRange } from "@/lib/redis";
import { unitStartTimesInRange } from "@/lib/availability";
import { sendBookingConfirmationEmail } from "@/lib/email";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const booking = await prisma.booking.findUnique({ where: { id }, include: { court: true, user: true } });
  if (!booking || booking.userId !== session.user.id) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.status !== "HOLD" || !booking.expiresAt || booking.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "This hold has expired. Please pick the slot again." }, { status: 409 });
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "CONFIRMED", paymentType: "PAY_AT_VENUE" },
  });
  const unitStarts = unitStartTimesInRange(booking.startTime, booking.endTime, booking.court.slotDurationMinutes);
  await releaseSlotLockRange(booking.courtId, booking.date, unitStarts);

  await sendBookingConfirmationEmail(booking.user.email, {
    courtName: booking.court.name,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    totalAmount: booking.totalAmount,
    paidAmount: booking.paidAmount,
  });

  return NextResponse.json({ status: "ok" });
}
