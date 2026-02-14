-- AlterTable
ALTER TABLE "MembershipYear" ADD COLUMN     "discountPriceCents" INTEGER NOT NULL DEFAULT 10000,
ADD COLUMN     "signupDate" TIMESTAMP(3),
ADD COLUMN     "signupEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "standardPriceCents" INTEGER NOT NULL DEFAULT 15000;
