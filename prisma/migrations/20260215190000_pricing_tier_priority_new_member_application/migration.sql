-- DropForeignKey
ALTER TABLE "MembershipApplication" DROP CONSTRAINT "MembershipApplication_memberId_fkey";

-- DropIndex
DROP INDEX "MembershipApplication_memberId_membershipYearId_key";

-- AlterTable
ALTER TABLE "MembershipApplication"
ADD COLUMN     "applicantAddress" TEXT,
ADD COLUMN     "applicantDob" TIMESTAMP(3),
ADD COLUMN     "applicantEmail" TEXT,
ADD COLUMN     "applicantFirstName" TEXT,
ADD COLUMN     "applicantLastName" TEXT,
ADD COLUMN     "applicantPhone" TEXT,
ADD COLUMN     "createdMemberId" TEXT;

-- Backfill applicant fields from the prior member relationship so existing rows remain valid.
UPDATE "MembershipApplication" AS app
SET
  "createdMemberId" = app."memberId",
  "applicantEmail" = member."email",
  "applicantFirstName" = split_part(member."name", ' ', 1),
  "applicantLastName" = CASE
    WHEN strpos(member."name", ' ') > 0 THEN substr(member."name", strpos(member."name", ' ') + 1)
    ELSE ''
  END,
  "applicantPhone" = member."phone",
  "applicantAddress" = member."address",
  "applicantDob" = member."dob"
FROM "Member" AS member
WHERE app."memberId" = member."id";

UPDATE "MembershipApplication"
SET
  "applicantEmail" = COALESCE("applicantEmail", concat('unknown+', id, '@mcfgc.local')),
  "applicantFirstName" = COALESCE(NULLIF("applicantFirstName", ''), 'Unknown'),
  "applicantLastName" = COALESCE("applicantLastName", '');

ALTER TABLE "MembershipApplication"
ALTER COLUMN "applicantEmail" SET NOT NULL,
ALTER COLUMN "applicantFirstName" SET NOT NULL,
ALTER COLUMN "applicantLastName" SET NOT NULL;

ALTER TABLE "MembershipApplication" DROP COLUMN "memberId";

-- AlterTable
ALTER TABLE "PricingTier" ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 100;

-- CreateIndex
CREATE INDEX "MembershipApplication_createdMemberId_idx" ON "MembershipApplication"("createdMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipApplication_membershipYearId_applicantEmail_key" ON "MembershipApplication"("membershipYearId", "applicantEmail");

-- AddForeignKey
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_createdMemberId_fkey" FOREIGN KEY ("createdMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
