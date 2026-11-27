import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isStaffOrAdmin } from "@/lib/permissions";

export async function GET(req: Request) {
  const session = await auth();
  if (!isStaffOrAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? undefined;
  const courtId = url.searchParams.get("courtId") ?? undefined;

  const bookings = await prisma.booking.findMany({
    where: {
      ...(date ? { date } : {}),
      ...(courtId ? { courtId } : {}),
      status: { not: "EXPIRED" },
    },
    include: { court: true, user: { select: { id: true, name: true, email: true, phone: true } } },
    orderBy: [{ date: "desc" }, { startTime: "asc" }],
  });

  return NextResponse.json(bookings);
}
