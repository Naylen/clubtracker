-- CreateEnum
CREATE TYPE "MemberDiscipline" AS ENUM ('ARCHERY', 'PISTOL', 'RIFLE', 'TRAP');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "disciplineInterests" "MemberDiscipline"[] DEFAULT ARRAY[]::"MemberDiscipline"[],
ADD COLUMN     "dlNumberAuthTag" TEXT,
ADD COLUMN     "dlNumberCiphertext" TEXT,
ADD COLUMN     "dlNumberHash" TEXT,
ADD COLUMN     "dlNumberIv" TEXT,
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "emergencyContactRelationship" TEXT;

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorMemberId" TEXT,
    "targetMemberId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_actorMemberId_idx" ON "AuditLog"("actorMemberId");

-- CreateIndex
CREATE INDEX "AuditLog_targetMemberId_idx" ON "AuditLog"("targetMemberId");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorMemberId_fkey" FOREIGN KEY ("actorMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetMemberId_fkey" FOREIGN KEY ("targetMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
