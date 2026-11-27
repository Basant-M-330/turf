import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isStaffOrAdmin } from "@/lib/permissions";
import { dateSchema, timeSchema } from "@/lib/validations/booking";
import { minutesToTime, timeToMinutes } from "@/lib/availability";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  courtId: z.string().min(1),
  date: dateSchema,
  startTime: timeSchema,
  reason: z.string().optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!isStaffOrAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const courtId = url.searchParams.get("courtId") ?? undefined;
  const date = url.searchParams.get("date") ?? undefined;

  const blocked = await prisma.blockedSlot.findMany({
    where: { ...(courtId ? { courtId } : {}), ...(date ? { date } : {}) },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  return NextResponse.json(blocked);
}

/** Staff/admin manually block a slot (e.g. maintenance, a private event). */
export async function POST(req: Request) {
  const session = await auth();
  if (!isStaffOrAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const court = await prisma.court.findUnique({ where: { id: parsed.data.courtId } });
  if (!court) {
    return NextResponse.json({ error: "Court not found" }, { status: 404 });
  }

  const existingBooking = await prisma.booking.findFirst({
    where: {
      courtId: parsed.data.courtId,
      date: parsed.data.date,
      startTime: parsed.data.startTime,
      status: { in: ["CONFIRMED", "PARTIALLY_PAID", "COMPLETED"] },
    },
  });
  if (existingBooking) {
    return NextResponse.json({ error: "This slot already has a booking" }, { status: 409 });
  }

  const endTime = minutesToTime(timeToMinutes(parsed.data.startTime) + court.slotDurationMinutes);
  const blocked = await prisma.blockedSlot.create({ data: { ...parsed.data, endTime } });
  await logAudit({
    actorId: session!.user.id,
    action: "blocked-slot.create",
    targetType: "BlockedSlot",
    targetId: blocked.id,
    metadata: parsed.data,
  });
  return NextResponse.json(blocked, { status: 201 });
}
