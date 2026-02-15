-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'DENIED');

-- AlterTable
ALTER TABLE "MembershipYear" ADD COLUMN     "applicationEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PricingTier" (
    "id" TEXT NOT NULL,
    "membershipYearId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSenior" BOOLEAN NOT NULL DEFAULT false,
    "requiresAdminApproval" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipApplication" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "membershipYearId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedDisabledVeteranDiscount" BOOLEAN NOT NULL DEFAULT false,
    "disabledVeteranApproved" BOOLEAN,
    "seniorAutoApplied" BOOLEAN NOT NULL DEFAULT false,
    "assignedPricingTierId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByMemberId" TEXT,
    "denialReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PricingTier_membershipYearId_isActive_idx" ON "PricingTier"("membershipYearId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PricingTier_membershipYearId_code_key" ON "PricingTier"("membershipYearId", "code");

-- CreateIndex
CREATE INDEX "MembershipApplication_membershipYearId_status_idx" ON "MembershipApplication"("membershipYearId", "status");

-- CreateIndex
CREATE INDEX "MembershipApplication_reviewedByMemberId_idx" ON "MembershipApplication"("reviewedByMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipApplication_memberId_membershipYearId_key" ON "MembershipApplication"("memberId", "membershipYearId");

-- AddForeignKey
ALTER TABLE "PricingTier" ADD CONSTRAINT "PricingTier_membershipYearId_fkey" FOREIGN KEY ("membershipYearId") REFERENCES "MembershipYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_reviewedByMemberId_fkey" FOREIGN KEY ("reviewedByMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_membershipYearId_fkey" FOREIGN KEY ("membershipYearId") REFERENCES "MembershipYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_assignedPricingTierId_fkey" FOREIGN KEY ("assignedPricingTierId") REFERENCES "PricingTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
