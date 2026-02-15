import type {
  Member,
  MembershipApplication,
  MembershipEnrollment,
  MembershipYear,
  PricingTier,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentYearInNewYork } from "@/lib/membership-dates";
import { logSetupIssueOnce } from "@/lib/runtime-env";
import { isDatabaseNotInitializedError } from "@/services/bootstrap";
import {
  determineRenewalTierForMember,
  getLateRenewalPolicy,
  isRenewalBlockedByLatePolicy,
} from "@/services/membership";
import { getCurrentYearOperationalState } from "@/services/operations-state";

export type PortalCallToAction =
  | { type: "pay_now"; message: string }
  | { type: "awaiting_approval"; message: string }
  | { type: "denied"; message: string }
  | { type: "apply"; message: string }
  | { type: "none"; message: string };

type PortalApplication =
  | (MembershipApplication & { assignedPricingTier: PricingTier | null })
  | null;

export type MemberPortalState = {
  setupRequired: boolean;
  setupMessage: string | null;
  currentYear: number;
  member: Member | null;
  membershipYear: MembershipYear | null;
  enrollment: MembershipEnrollment | null;
  application: PortalApplication;
  effectiveTier: Pick<PricingTier, "id" | "code" | "name" | "amountCents"> | null;
  isExistingMember: boolean;
  alreadyRenewed: boolean;
  lateRenewalPolicy: Awaited<ReturnType<typeof getLateRenewalPolicy>>;
  canPay: boolean;
  cta: PortalCallToAction;
};

function buildSetupRequiredPortalState(input: {
  year: number;
  message: string;
}): MemberPortalState {
  return {
    setupRequired: true,
    setupMessage: input.message,
    currentYear: input.year,
    member: null,
    membershipYear: null,
    enrollment: null,
    application: null,
    effectiveTier: null,
    isExistingMember: false,
    alreadyRenewed: false,
    lateRenewalPolicy: {
      enabled: false,
      policyNotes: "Late renewal policy unavailable while setup is incomplete.",
    },
    canPay: false,
    cta: {
      type: "none",
      message: "System setup is required before portal actions are available.",
    },
  };
}

export async function getMemberPortalState(input: {
  memberId: string;
  email: string;
}): Promise<MemberPortalState> {
  const currentYear = getCurrentYearInNewYork();
  const operationalState = await getCurrentYearOperationalState();

  if (!operationalState.dbReady) {
    return buildSetupRequiredPortalState({
      year: currentYear,
      message:
        operationalState.setupMessage ??
        operationalState.alerts[0] ??
        "Database is not initialized. Run migrations/seed.",
    });
  }

  try {
    const [member, membershipYear, hasAnyActiveEnrollment] = await Promise.all([
      prisma.member.findUnique({ where: { id: input.memberId } }),
      prisma.membershipYear.findUnique({ where: { year: currentYear } }),
      prisma.membershipEnrollment.count({
        where: {
          memberId: input.memberId,
          status: "ACTIVE",
        },
      }),
    ]);

    const enrollment = membershipYear
      ? await prisma.membershipEnrollment.findUnique({
          where: {
            memberId_membershipYearId: {
              memberId: input.memberId,
              membershipYearId: membershipYear.id,
            },
          },
        })
      : null;

    const application = membershipYear
      ? await prisma.membershipApplication.findUnique({
          where: {
            membershipYearId_applicantEmail: {
              membershipYearId: membershipYear.id,
              applicantEmail: input.email,
            },
          },
          include: {
            assignedPricingTier: true,
          },
        })
      : null;

    const renewalTier =
      member && membershipYear ? await determineRenewalTierForMember({ member, membershipYear }) : null;
    const effectiveTier = application?.assignedPricingTier ?? renewalTier;
    const isExistingMember = hasAnyActiveEnrollment > 0;
    const alreadyRenewed = enrollment?.status === "ACTIVE";
    const applicationApproved =
      application?.status === "APPROVED" && Boolean(application.assignedPricingTier);

    const lateRenewalPolicy = await getLateRenewalPolicy();
    const renewalBlocked =
      membershipYear && isExistingMember
        ? await isRenewalBlockedByLatePolicy({ membershipYear })
        : false;

    const canPay =
      Boolean(member && membershipYear && !alreadyRenewed && !renewalBlocked) &&
      (isExistingMember || applicationApproved);

    let cta: PortalCallToAction = {
      type: "none",
      message: "No action is currently required.",
    };

    if (!membershipYear) {
      cta = { type: "none", message: `Membership year ${currentYear} is not available yet.` };
    } else if (!isExistingMember && !application) {
      cta = { type: "apply", message: "Start your application to continue." };
    } else if (application?.status === "SUBMITTED") {
      cta = { type: "awaiting_approval", message: "Application submitted. Awaiting admin approval." };
    } else if (application?.status === "DENIED") {
      cta = {
        type: "denied",
        message: application.denialReason
          ? `Application denied: ${application.denialReason}`
          : "Application denied. Contact the club for next steps.",
      };
    } else if (application?.status === "APPROVED" && !application.assignedPricingTier) {
      cta = {
        type: "awaiting_approval",
        message: "Application approved. Awaiting pricing tier assignment before payment is available.",
      };
    } else if (alreadyRenewed) {
      cta = { type: "none", message: "Your membership is already active for this year." };
    } else if (renewalBlocked) {
      cta = {
        type: "none",
        message: "Renewal is past due and late renewals are currently disabled.",
      };
    } else if (canPay) {
      cta = { type: "pay_now", message: "Payment is available now." };
    }

    return {
      setupRequired: false,
      setupMessage: null,
      currentYear,
      member,
      membershipYear,
      enrollment,
      application,
      effectiveTier,
      isExistingMember,
      alreadyRenewed,
      lateRenewalPolicy,
      canPay,
      cta,
    };
  } catch (error) {
    if (isDatabaseNotInitializedError(error)) {
      logSetupIssueOnce(
        "database-not-initialized:member-portal",
        "Member portal queries failed because database tables are missing. Run migrations/seed.",
        error
      );
      return buildSetupRequiredPortalState({
        year: currentYear,
        message: "Database is not initialized. Run migrations/seed.",
      });
    }
    throw error;
  }
}
