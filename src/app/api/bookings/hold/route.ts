import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { acquireSlotLockRange, releaseSlotLockRange, SLOT_HOLD_SECONDS } from "@/lib/redis";
import { holdSlotSchema } from "@/lib/validations/booking";
import {
  expireStaleHolds,
  minutesToTime,
  timeToMinutes,
  dayOfWeekForDate,
  dayTypeForDate,
  priceForSlot,
  unitStartTimesInRange,
} from "@/lib/availability";
import { partialAmount } from "@/lib/razorpay";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "You must be signed in to book a slot." }, { status: 401 });
  }

  if (!(await checkRateLimit(`ratelimit:hold:${session.user.id}`, 20, 5 * 60))) {
    return NextResponse.json({ error: "Too many attempts. Please wait a moment and try again." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = holdSlotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { courtId, date, startTime, durationSlots } = parsed.data;

  const court = await prisma.court.findUnique({
    where: { id: courtId },
    include: { pricingRules: true, operatingHours: true },
  });
  if (!court || !court.isActive) {
    return NextResponse.json({ error: "Court not found" }, { status: 404 });
  }

  const startMin = timeToMinutes(startTime);
  const endMin = startMin + durationSlots * court.slotDurationMinutes;
  const endTime = minutesToTime(endMin);

  const requestedStart = new Date(`${date}T${startTime}:00`);
  if (Number.isNaN(requestedStart.getTime()) || requestedStart.getTime() < Date.now()) {
    return NextResponse.json({ error: "Cannot book a slot in the past" }, { status: 400 });
  }

  const hours = court.operatingHours.find((h) => h.dayOfWeek === dayOfWeekForDate(date));
  if (!hours || startMin < timeToMinutes(hours.openTime) || endMin > timeToMinutes(hours.closeTime)) {
    return NextResponse.json({ error: "That duration runs outside the court's operating hours" }, { status: 400 });
  }

  await expireStaleHolds(courtId, date);

  const [overlappingBooking, overlappingBlock] = await Promise.all([
    prisma.booking.findFirst({
      where: {
        courtId,
        date,
        status: { in: ["CONFIRMED", "PARTIALLY_PAID", "COMPLETED"] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    }),
    prisma.blockedSlot.findFirst({
      where: { courtId, date, startTime: { lt: endTime }, endTime: { gt: startTime } },
    }),
  ]);
  if (overlappingBooking || overlappingBlock) {
    return NextResponse.json({ error: "This time range is no longer fully available" }, { status: 409 });
  }

  const dayType = dayTypeForDate(date);
  const unitStarts = unitStartTimesInRange(startTime, endTime, court.slotDurationMinutes);
  const unitPrices = unitStarts.map((unitStart) => priceForSlot(court.pricingRules, dayType, unitStart));
  if (unitPrices.some((price) => price <= 0)) {
    return NextResponse.json({ error: "No price configured for part of this duration" }, { status: 400 });
  }
  const totalAmount = unitPrices.reduce((sum, price) => sum + price, 0);

  const bookingId = crypto.randomUUID();
  const locked = await acquireSlotLockRange(courtId, date, unitStarts, bookingId);
  if (!locked) {
    return NextResponse.json(
      { error: "Part of this time range is currently held by someone else. Try again." },
      { status: 409 }
    );
  }

  try {
    const expiresAt = new Date(Date.now() + SLOT_HOLD_SECONDS * 1000);
    const booking = await prisma.booking.create({
      data: {
        id: bookingId,
        courtId,
        userId: session.user.id,
        date,
        startTime,
        endTime,
        status: "HOLD",
        totalAmount,
        expiresAt,
      },
    });

    return NextResponse.json({
      bookingId: booking.id,
      expiresAt: booking.expiresAt,
      totalAmount: booking.totalAmount,
      partialAmount: partialAmount(booking.totalAmount),
      date,
      startTime,
      endTime,
    });
  } catch (err) {
    await releaseSlotLockRange(courtId, date, unitStarts);
    throw err;
  }
}
