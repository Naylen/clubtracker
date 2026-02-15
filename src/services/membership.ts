import { Prisma, type Member, type MembershipYear } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  buildMembershipYearDates,
  getCurrentYearInNewYork,
  isSeniorFromDob,
} from "@/lib/membership-dates";

export const DEFAULT_MEMBERSHIP_CAP = 350;
export const DEFAULT_STANDARD_RENEWAL_PRICE_CENTS = 15000;
export const DEFAULT_DISCOUNT_RENEWAL_PRICE_CENTS = 10000;
const ACCEPT_LATE_RENEWALS_KEY = "acceptLateRenewals";

const DEFAULT_PRICING_TIERS = [
  {
    code: "STANDARD",
    name: "Standard",
    amountCents: DEFAULT_STANDARD_RENEWAL_PRICE_CENTS,
    isSenior: false,
  },
  {
    code: "SENIOR",
    name: "Senior (65+)",
    amountCents: DEFAULT_DISCOUNT_RENEWAL_PRICE_CENTS,
    isSenior: true,
  },
  {
    code: "DISABLED_VETERAN",
    name: "Disabled Veteran",
    amountCents: DEFAULT_DISCOUNT_RENEWAL_PRICE_CENTS,
    isSenior: false,
  },
] as const;

export type LateRenewalPolicy = {
  enabled: boolean;
  policyNotes: string;
};

export type RenewalDiscountReason = "DISABLED_VETERAN" | "AGE_65_PLUS" | null;

export function getRenewalPriceForMember(
  member: Pick<Member, "isDisabledVeteran" | "isSenior" | "dob">,
  membershipYear?: Pick<MembershipYear, "standardPriceCents" | "discountPriceCents">
): { amountCents: number; discountReason: RenewalDiscountReason } {
  const standardPrice = membershipYear?.standardPriceCents ?? DEFAULT_STANDARD_RENEWAL_PRICE_CENTS;
  const discountPrice = membershipYear?.discountPriceCents ?? DEFAULT_DISCOUNT_RENEWAL_PRICE_CENTS;

  if (member.isDisabledVeteran) {
    return {
      amountCents: discountPrice,
      discountReason: "DISABLED_VETERAN",
    };
  }

  const seniorEligible = member.isSenior || isSeniorFromDob(member.dob);
  if (seniorEligible) {
    return {
      amountCents: discountPrice,
      discountReason: "AGE_65_PLUS",
    };
  }

  return {
    amountCents: standardPrice,
    discountReason: null,
  };
}

export async function isRenewalBlockedByLatePolicy(input: {
  membershipYear: Pick<MembershipYear, "renewalDueAt">;
  asOf?: Date;
}): Promise<boolean> {
  const lateRenewalPolicy = await getLateRenewalPolicy();
  const now = input.asOf ?? new Date();
  const isLate = now > input.membershipYear.renewalDueAt;
  return isLate && !lateRenewalPolicy.enabled;
}

export async function getLateRenewalPolicy(): Promise<LateRenewalPolicy> {
  const setting = await prisma.systemSettings.findUnique({
    where: { key: ACCEPT_LATE_RENEWALS_KEY },
  });

  if (!setting) {
    return {
      enabled: false,
      policyNotes: "Default policy: payments after Jan 31 are not accepted.",
    };
  }

  const value = setting.value as Prisma.JsonObject;
  return {
    enabled: value.enabled === true,
    policyNotes:
      typeof value.policyNotes === "string"
        ? value.policyNotes
        : "Default policy: payments after Jan 31 are not accepted.",
  };
}

export async function createOrOpenCurrentYear(asOf = new Date()) {
  const year = getCurrentYearInNewYork(asOf);
  return createOrOpenMembershipYear(year);
}

export async function createOrOpenMembershipYear(year: number) {
  const dates = buildMembershipYearDates(year);
  const defaultSignupDate = new Date(`${year}-02-01T09:00:00-05:00`);

  let membershipYear = await prisma.membershipYear.upsert({
    where: { year },
    update: {},
    create: {
      year,
      membershipCap: DEFAULT_MEMBERSHIP_CAP,
      standardPriceCents: DEFAULT_STANDARD_RENEWAL_PRICE_CENTS,
      discountPriceCents: DEFAULT_DISCOUNT_RENEWAL_PRICE_CENTS,
      signupDate: defaultSignupDate,
      signupEnabled: true,
      applicationEnabled: false,
      ...dates,
    },
  });

  if (!membershipYear.signupDate) {
    membershipYear = await prisma.membershipYear.update({
      where: { id: membershipYear.id },
      data: { signupDate: defaultSignupDate },
    });
  }

  await prisma.systemSettings.upsert({
    where: { key: ACCEPT_LATE_RENEWALS_KEY },
    update: {},
    create: {
      key: ACCEPT_LATE_RENEWALS_KEY,
      value: {
        enabled: false,
        policyNotes: "Default policy: payments after Jan 31 are not accepted.",
      },
    },
  });

  const signupOverrideKey = `signupDayOverride:${year}`;
  await prisma.systemSettings.upsert({
    where: { key: signupOverrideKey },
    update: {},
    create: {
      key: signupOverrideKey,
      value: {
        year,
        datetime: `${year}-02-01T09:00:00-05:00`,
      },
    },
  });

  await ensureDefaultPricingTiers(membershipYear.id);

  return membershipYear;
}

export async function ensureDefaultPricingTiers(membershipYearId: string) {
  for (const tier of DEFAULT_PRICING_TIERS) {
    await prisma.pricingTier.upsert({
      where: {
        membershipYearId_code: {
          membershipYearId,
          code: tier.code,
        },
      },
      update: {
        name: tier.name,
        amountCents: tier.amountCents,
        isActive: true,
        isSenior: tier.isSenior,
        requiresAdminApproval: true,
      },
      create: {
        membershipYearId,
        code: tier.code,
        name: tier.name,
        amountCents: tier.amountCents,
        isActive: true,
        isSenior: tier.isSenior,
        requiresAdminApproval: true,
      },
    });
  }
}

export async function countActiveEnrollments(membershipYearId: string): Promise<number> {
  return prisma.membershipEnrollment.count({
    where: {
      membershipYearId,
      status: "ACTIVE",
    },
  });
}

export async function getCapacityRemaining(year: number): Promise<number> {
  const membershipYear = await prisma.membershipYear.findUnique({ where: { year } });
  if (!membershipYear) {
    return 0;
  }

  const activeCount = await countActiveEnrollments(membershipYear.id);
  return Math.max(0, membershipYear.membershipCap - activeCount);
}

export async function expirePendingRenewalsIfPastDue(
  membershipYearId: string,
  asOf = new Date()
): Promise<number> {
  const membershipYear = await prisma.membershipYear.findUnique({
    where: { id: membershipYearId },
  });

  if (!membershipYear || asOf <= membershipYear.renewalDueAt) {
    return 0;
  }

  const result = await prisma.membershipEnrollment.updateMany({
    where: {
      membershipYearId,
      status: "PENDING_RENEWAL",
    },
    data: {
      status: "LAPSED",
    },
  });

  return result.count;
}

export async function recordMembershipPayment(input: {
  memberId: string;
  membershipYearId: string;
  amountCents: number;
  externalId?: string;
  webhookEventId?: string;
  paidAt?: Date;
}) {
  const paidAt = input.paidAt ?? new Date();

  if (input.webhookEventId) {
    const existingPayment = await prisma.payment.findUnique({
      where: { webhookEventId: input.webhookEventId },
      include: { enrollment: true },
    });

    if (existingPayment) {
      return {
        payment: existingPayment,
        enrollment: existingPayment.enrollment,
      };
    }
  }

  return prisma.$transaction(async (tx) => {
    const membershipYear = await tx.membershipYear.findUnique({
      where: { id: input.membershipYearId },
    });

    if (!membershipYear) {
      throw new Error("Membership year not found.");
    }

    const lateRenewalPolicy = await getLateRenewalPolicy();
    const isLate = paidAt > membershipYear.renewalDueAt;
    if (isLate && !lateRenewalPolicy.enabled) {
      throw new Error("Late renewals are not currently accepted.");
    }

    const currentEnrollment = await tx.membershipEnrollment.findUnique({
      where: {
        memberId_membershipYearId: {
          memberId: input.memberId,
          membershipYearId: input.membershipYearId,
        },
      },
    });

    const activeEnrollments = await tx.membershipEnrollment.count({
      where: {
        membershipYearId: input.membershipYearId,
        status: "ACTIVE",
      },
    });

    const memberAlreadyActive = currentEnrollment?.status === "ACTIVE";
    if (!memberAlreadyActive && activeEnrollments >= membershipYear.membershipCap) {
      throw new Error("Membership capacity reached for this year.");
    }

    const enrollment = await tx.membershipEnrollment.upsert({
      where: {
        memberId_membershipYearId: {
          memberId: input.memberId,
          membershipYearId: input.membershipYearId,
        },
      },
      update: {
        status: "ACTIVE",
        renewedAt: paidAt,
      },
      create: {
        memberId: input.memberId,
        membershipYearId: input.membershipYearId,
        status: "ACTIVE",
        renewedAt: paidAt,
      },
    });

    const payment = await tx.payment.create({
      data: {
        provider: "STRIPE",
        amountCents: input.amountCents,
        status: "SUCCEEDED",
        externalId: input.externalId,
        webhookEventId: input.webhookEventId,
        paidAt,
        memberId: input.memberId,
        membershipYearId: input.membershipYearId,
        enrollmentId: enrollment.id,
      },
    });

    return { payment, enrollment };
  });
}
