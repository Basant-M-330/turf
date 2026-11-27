import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRazorpay, partialAmount } from "@/lib/razorpay";
import { createPaymentOrderSchema } from "@/lib/validations/booking";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await checkRateLimit(`ratelimit:payment-order:${session.user.id}`, 20, 5 * 60))) {
    return NextResponse.json({ error: "Too many attempts. Please wait a moment and try again." }, { status: 429 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createPaymentOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking || booking.userId !== session.user.id) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.status !== "HOLD" || !booking.expiresAt || booking.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "This hold has expired. Please pick the slot again." }, { status: 409 });
  }

  const { paymentType } = parsed.data;
  const amount = paymentType === "FULL" ? booking.totalAmount : partialAmount(booking.totalAmount);

  const order = await getRazorpay().orders.create({
    amount: amount * 100,
    currency: "INR",
    receipt: booking.id,
    notes: { bookingId: booking.id, paymentType },
  });

  await prisma.$transaction([
    prisma.booking.update({ where: { id: booking.id }, data: { paymentType } }),
    prisma.payment.create({
      data: {
        bookingId: booking.id,
        razorpayOrderId: order.id,
        amount,
        status: "CREATED",
      },
    }),
  ]);

  return NextResponse.json({
    orderId: order.id,
    amount,
    currency: "INR",
    keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
  });
}
