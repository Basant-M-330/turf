import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, isStaffOrAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const updateCourtSchema = z.object({
  name: z.string().min(1).optional(),
  sportType: z.enum(["FOOTBALL", "CRICKET", "BADMINTON", "TENNIS", "BASKETBALL", "OTHER"]).optional(),
  description: z.string().optional(),
  slotDurationMinutes: z.number().int().min(15).max(240).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isStaffOrAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const court = await prisma.court.findUnique({
    where: { id },
    include: { operatingHours: true, pricingRules: true },
  });
  if (!court) return NextResponse.json({ error: "Court not found" }, { status: 404 });
  return NextResponse.json(court);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateCourtSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const court = await prisma.court.update({ where: { id }, data: parsed.data });
  await logAudit({ actorId: session!.user.id, action: "court.update", targetType: "Court", targetId: id, metadata: parsed.data });
  return NextResponse.json(court);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.court.update({ where: { id }, data: { isActive: false } });
  await logAudit({ actorId: session!.user.id, action: "court.deactivate", targetType: "Court", targetId: id });
  return NextResponse.json({ status: "ok" });
}
