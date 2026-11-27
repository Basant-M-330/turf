import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, isStaffOrAdmin } from "@/lib/permissions";
import { timeSchema } from "@/lib/validations/booking";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  dayType: z.enum(["WEEKDAY", "WEEKEND"]),
  startTime: timeSchema,
  endTime: timeSchema,
  pricePerSlot: z.number().int().positive(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isStaffOrAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const rules = await prisma.pricingRule.findMany({ where: { courtId: id }, orderBy: { startTime: "asc" } });
  return NextResponse.json(rules);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const rule = await prisma.pricingRule.create({ data: { ...parsed.data, courtId: id } });
  await logAudit({ actorId: session!.user.id, action: "pricing.create", targetType: "PricingRule", targetId: rule.id, metadata: parsed.data });
  return NextResponse.json(rule, { status: 201 });
}
