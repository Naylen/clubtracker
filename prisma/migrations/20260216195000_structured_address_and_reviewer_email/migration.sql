-- Add structured address fields to Member and migrate legacy address values.
ALTER TABLE "Member"
ADD COLUMN "street1" TEXT NOT NULL DEFAULT '',
ADD COLUMN "street2" TEXT,
ADD COLUMN "city" TEXT NOT NULL DEFAULT '',
ADD COLUMN "state" TEXT NOT NULL DEFAULT '',
ADD COLUMN "zip" TEXT NOT NULL DEFAULT '';

UPDATE "Member"
SET "street1" = COALESCE(NULLIF("address", ''), "street1")
WHERE "address" IS NOT NULL
  AND COALESCE("street1", '') = '';

ALTER TABLE "Member" DROP COLUMN "address";

-- Add structured address fields to MembershipApplication, preserve legacy values,
-- and store reviewer email without requiring a Member FK.
ALTER TABLE "MembershipApplication"
ADD COLUMN "applicantStreet1" TEXT NOT NULL DEFAULT '',
ADD COLUMN "applicantStreet2" TEXT,
ADD COLUMN "applicantCity" TEXT NOT NULL DEFAULT '',
ADD COLUMN "applicantState" TEXT NOT NULL DEFAULT '',
ADD COLUMN "applicantZip" TEXT NOT NULL DEFAULT '',
ADD COLUMN "reviewedByEmail" TEXT;

UPDATE "MembershipApplication"
SET "applicantStreet1" = COALESCE(NULLIF("applicantAddress", ''), "applicantStreet1")
WHERE "applicantAddress" IS NOT NULL
  AND COALESCE("applicantStreet1", '') = '';

UPDATE "MembershipApplication" AS app
SET "reviewedByEmail" = reviewer."email"
FROM "Member" AS reviewer
WHERE app."reviewedByMemberId" = reviewer."id"
  AND app."reviewedByEmail" IS NULL;

ALTER TABLE "MembershipApplication" DROP COLUMN "applicantAddress";
