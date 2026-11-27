import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyPaymentSignature } from "@/lib/razorpay";
import { releaseSlotLockRange } from "@/lib/redis";
import { unitStartTimesInRange } from "@/lib/availability";
import { sendBookingConfirmationEmail } from "@/lib/email";

const schema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;

  const valid = verifyPaymentSignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
  });
  if (!valid) {
    return NextResponse.json({ error: "Payment signature verification failed" }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { payments: true, court: true, user: true },
  });
  if (!booking || booking.userId !== session.user.id) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const payment = booking.payments.find((p) => p.razorpayOrderId === razorpayOrderId);
  if (!payment) {
    return NextResponse.json({ error: "Payment order not found for this booking" }, { status: 404 });
  }

  if (payment.status !== "CAPTURED") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "CAPTURED", razorpayPaymentId },
    });

    const newPaidAmount = booking.paidAmount + payment.amount;
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        paidAmount: newPaidAmount,
        status: booking.paymentType === "FULL" ? "CONFIRMED" : "PARTIALLY_PAID",
      },
    });

    const unitStarts = unitStartTimesInRange(booking.startTime, booking.endTime, booking.court.slotDurationMinutes);
    await releaseSlotLockRange(booking.courtId, booking.date, unitStarts);

    await sendBookingConfirmationEmail(booking.user.email, {
      courtName: booking.court.name,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      totalAmount: booking.totalAmount,
      paidAmount: newPaidAmount,
    });
  }

  return NextResponse.json({ status: "ok" });
}
