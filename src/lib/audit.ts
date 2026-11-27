import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Records an admin/staff action for later review (price changes, staff changes, cancellations, ...). */
export async function logAudit(params: {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
