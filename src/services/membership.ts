import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  buildMembershipYearDates,
  getCurrentYearInNewYork,
} from "@/lib/membership-dates";

export const MEMBERSHIP_CAP = 350;
const ACCEPT_LATE_RENEWALS_KEY = "acceptLateRenewals";

export type LateRenewalPolicy = {
  enabled: boolean;
  policyNotes: string;
};

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
  const dates = buildMembershipYearDates(year);

  const membershipYear = await prisma.membershipYear.upsert({
    where: { year },
    update: dates,
    create: {
      year,
      capacity: MEMBERSHIP_CAP,
      ...dates,
    },
  });

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

  return membershipYear;
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
  return Math.max(0, membershipYear.capacity - activeCount);
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
    if (!memberAlreadyActive && activeEnrollments >= membershipYear.capacity) {
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
