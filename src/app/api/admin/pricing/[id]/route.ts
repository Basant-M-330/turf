import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.pricingRule.delete({ where: { id } });
  await logAudit({ actorId: session!.user.id, action: "pricing.delete", targetType: "PricingRule", targetId: id });
  return NextResponse.json({ status: "ok" });
}
