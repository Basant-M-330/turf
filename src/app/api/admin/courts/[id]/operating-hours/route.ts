import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/permissions";
import { timeSchema } from "@/lib/validations/booking";
import { logAudit } from "@/lib/audit";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;

const schema = z.object({
  hours: z
    .array(
      z.object({
        dayOfWeek: z.enum(DAYS),
        openTime: timeSchema,
        closeTime: timeSchema,
      })
    )
    .min(1),
});

/** Replaces this court's full weekly operating-hours schedule. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  await prisma.$transaction([
    prisma.operatingHours.deleteMany({ where: { courtId: id } }),
    prisma.operatingHours.createMany({
      data: parsed.data.hours.map((h) => ({ ...h, courtId: id })),
    }),
  ]);

  await logAudit({
    actorId: session!.user.id,
    action: "operating-hours.update",
    targetType: "Court",
    targetId: id,
    metadata: { hours: parsed.data.hours },
  });

  const hours = await prisma.operatingHours.findMany({ where: { courtId: id } });
  return NextResponse.json(hours);
}
