import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, isStaffOrAdmin } from "@/lib/permissions";
import { multiCourtEnabled } from "@/lib/config";
import { logAudit } from "@/lib/audit";

const createCourtSchema = z.object({
  name: z.string().min(1),
  sportType: z.enum(["FOOTBALL", "CRICKET", "BADMINTON", "TENNIS", "BASKETBALL", "OTHER"]),
  description: z.string().optional(),
  slotDurationMinutes: z.number().int().min(15).max(240).default(60),
});

export async function GET() {
  const session = await auth();
  if (!isStaffOrAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const courts = await prisma.court.findMany({
    orderBy: { name: "asc" },
    include: { operatingHours: true, pricingRules: true },
  });
  return NextResponse.json(courts);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!multiCourtEnabled) {
    const existingCount = await prisma.court.count();
    if (existingCount >= 1) {
      return NextResponse.json(
        { error: "This deployment is configured for a single court. Enable MULTI_COURT to add more." },
        { status: 400 }
      );
    }
  }

  const body = await req.json().catch(() => null);
  const parsed = createCourtSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const court = await prisma.court.create({ data: parsed.data });
  await logAudit({ actorId: session!.user.id, action: "court.create", targetType: "Court", targetId: court.id, metadata: parsed.data });
  return NextResponse.json(court, { status: 201 });
}
