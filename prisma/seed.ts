import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

function getCurrentYearInNewYork(date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
    }).format(date)
  );
}

function buildMembershipYearDates(year: number) {
  return {
    startsAt: new Date(`${year}-01-01T00:00:00-05:00`),
    endsAt: new Date(`${year}-12-31T23:59:59.999-05:00`),
    renewalOpensAt: new Date(`${year}-01-01T00:00:00-05:00`),
    renewalDueAt: new Date(`${year}-01-31T23:59:59.999-05:00`),
  };
}

async function main() {
  const currentYear = getCurrentYearInNewYork();
  const dates = buildMembershipYearDates(currentYear);

  await prisma.membershipYear.upsert({
    where: { year: currentYear },
    update: {},
    create: {
      year: currentYear,
      membershipCap: 350,
      standardPriceCents: 15000,
      discountPriceCents: 10000,
      signupDate: new Date(`${currentYear}-02-01T09:00:00-05:00`),
      signupEnabled: true,
      applicationEnabled: false,
      ...dates,
    },
  });

  const membershipYear = await prisma.membershipYear.findUnique({
    where: { year: currentYear },
    select: { id: true },
  });

  if (!membershipYear) {
    throw new Error("Membership year could not be created for seeding pricing tiers.");
  }

  const defaultTiers = [
    {
      code: "STANDARD",
      name: "Standard",
      amountCents: 15000,
      isSenior: false,
    },
    {
      code: "SENIOR",
      name: "Senior (65+)",
      amountCents: 10000,
      isSenior: true,
    },
    {
      code: "DISABLED_VETERAN",
      name: "Disabled Veteran",
      amountCents: 10000,
      isSenior: false,
    },
  ];

  for (const tier of defaultTiers) {
    await prisma.pricingTier.upsert({
      where: {
        membershipYearId_code: {
          membershipYearId: membershipYear.id,
          code: tier.code,
        },
      },
      update: {
        name: tier.name,
        amountCents: tier.amountCents,
        isActive: true,
        isSenior: tier.isSenior,
        requiresAdminApproval: true,
        priority:
          tier.code === "STANDARD" ? 100 : tier.code === "SENIOR" ? 90 : 95,
      },
      create: {
        membershipYearId: membershipYear.id,
        code: tier.code,
        name: tier.name,
        amountCents: tier.amountCents,
        isActive: true,
        isSenior: tier.isSenior,
        requiresAdminApproval: true,
        priority:
          tier.code === "STANDARD" ? 100 : tier.code === "SENIOR" ? 90 : 95,
      },
    });
  }

  await prisma.systemSettings.upsert({
    where: { key: "acceptLateRenewals" },
    update: {},
    create: {
      key: "acceptLateRenewals",
      value: {
        enabled: false,
        policyNotes:
          "Default policy: payments received after Jan 31 are not accepted.",
      },
    },
  });

  await prisma.systemSettings.upsert({
    where: { key: `signupDayOverride:${currentYear}` },
    update: {},
    create: {
      key: `signupDayOverride:${currentYear}`,
      value: {
        year: currentYear,
        datetime: `${currentYear}-02-01T09:00:00-05:00`,
      },
    },
  });

  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@mcfgc.local").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? "change-me-now";

  await prisma.member.upsert({
    where: { email: adminEmail },
    update: {
      name: "MCFGC Admin",
      role: "ADMIN",
      isActive: true,
    },
    create: {
      name: "MCFGC Admin",
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      role: "ADMIN",
      isActive: true,
    },
  });

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
