import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function createAuditLog(input: {
  action: string;
  actorMemberId?: string | null;
  targetMemberId?: string | null;
  meta?: Prisma.InputJsonValue;
}) {
  return prisma.auditLog.create({
    data: {
      action: input.action,
      actorMemberId: input.actorMemberId ?? null,
      targetMemberId: input.targetMemberId ?? null,
      meta: input.meta ?? Prisma.JsonNull,
    },
  });
}
