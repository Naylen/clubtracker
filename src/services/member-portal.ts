import { prisma } from "@/lib/db";
import { getCurrentYearInNewYork } from "@/lib/membership-dates";
import {
  determineRenewalTierForMember,
  getLateRenewalPolicy,
  isRenewalBlockedByLatePolicy,
} from "@/services/membership";

export type PortalCallToAction =
  | { type: "pay_now"; message: string }
  | { type: "awaiting_approval"; message: string }
  | { type: "denied"; message: string }
  | { type: "apply"; message: string }
  | { type: "none"; message: string };

export async function getMemberPortalState(input: { memberId: string; email: string }) {
  const currentYear = getCurrentYearInNewYork();
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
}
