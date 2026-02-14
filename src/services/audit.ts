import { prisma } from "@/lib/db";

export async function createAuditLog(input: {
  action: string;
  actorMemberId?: string | null;
  targetMemberId?: string | null;
  meta?: Record<string, unknown>;
}) {
  return prisma.auditLog.create({
    data: {
      action: input.action,
      actorMemberId: input.actorMemberId ?? null,
      targetMemberId: input.targetMemberId ?? null,
      meta: input.meta ?? null,
    },
  });
}
