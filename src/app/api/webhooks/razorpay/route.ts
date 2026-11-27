import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { releaseSlotLockRange } from "@/lib/redis";
import { unitStartTimesInRange } from "@/lib/availability";
import { sendBookingConfirmationEmail } from "@/lib/email";

interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  amount: number;
}

interface RazorpayWebhookPayload {
  event: string;
  payload: { payment: { entity: RazorpayPaymentEntity } };
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(rawBody) as RazorpayWebhookPayload;
  const entity = event.payload?.payment?.entity;
  if (!entity) {
    return NextResponse.json({ status: "ignored" });
  }

  const payment = await prisma.payment.findUnique({
    where: { razorpayOrderId: entity.order_id },
    include: { booking: { include: { court: true, user: true } } },
  });
  if (!payment) {
    return NextResponse.json({ status: "ignored" });
  }

  if (event.event === "payment.captured" && payment.status !== "CAPTURED") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "CAPTURED", razorpayPaymentId: entity.id },
    });
    const newPaidAmount = payment.booking.paidAmount + payment.amount;
    await prisma.booking.update({
      where: { id: payment.bookingId },
      data: {
        paidAmount: newPaidAmount,
        status: payment.booking.paymentType === "FULL" ? "CONFIRMED" : "PARTIALLY_PAID",
      },
    });
    const unitStarts = unitStartTimesInRange(
      payment.booking.startTime,
      payment.booking.endTime,
      payment.booking.court.slotDurationMinutes
    );
    await releaseSlotLockRange(payment.booking.courtId, payment.booking.date, unitStarts);

    await sendBookingConfirmationEmail(payment.booking.user.email, {
      courtName: payment.booking.court.name,
      date: payment.booking.date,
      startTime: payment.booking.startTime,
      endTime: payment.booking.endTime,
      totalAmount: payment.booking.totalAmount,
      paidAmount: newPaidAmount,
    });
  } else if (event.event === "payment.failed" && payment.status !== "CAPTURED") {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
  }

  return NextResponse.json({ status: "ok" });
}
