import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

/** Demotes a staff/admin account back to a plain customer (no hard delete, to keep booking history intact). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (id === session!.user.id) {
    return NextResponse.json({ error: "You cannot remove your own admin access" }, { status: 400 });
  }
  await prisma.user.update({ where: { id }, data: { role: "CUSTOMER" } });
  await logAudit({ actorId: session!.user.id, action: "staff.remove", targetType: "User", targetId: id });
  return NextResponse.json({ status: "ok" });
}
