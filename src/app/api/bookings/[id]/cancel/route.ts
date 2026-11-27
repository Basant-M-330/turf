import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { releaseSlotLockRange } from "@/lib/redis";
import { unitStartTimesInRange } from "@/lib/availability";
import { isStaffOrAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const booking = await prisma.booking.findUnique({ where: { id }, include: { court: true } });
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const isOwner = booking.userId === session.user.id;
  if (!isOwner && !isStaffOrAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (booking.status === "CANCELLED" || booking.status === "COMPLETED") {
    return NextResponse.json({ error: "Booking cannot be cancelled" }, { status: 409 });
  }

  await prisma.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED" } });
  const unitStarts = unitStartTimesInRange(booking.startTime, booking.endTime, booking.court.slotDurationMinutes);
  await releaseSlotLockRange(booking.courtId, booking.date, unitStarts);

  if (!isOwner) {
    await logAudit({ actorId: session.user.id, action: "booking.cancel", targetType: "Booking", targetId: booking.id });
  }

  return NextResponse.json({ status: "ok" });
}
