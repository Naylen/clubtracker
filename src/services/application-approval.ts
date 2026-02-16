import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { determineSignupDay, isSeniorOnDate } from "@/lib/membership-dates";

export class ApplicationApprovalError extends Error {
  code:
    | "APPLICATION_NOT_FOUND"
    | "TIER_REQUIRED"
    | "INVALID_TIER"
    | "SENIOR_OVERRIDE_CONFIRMATION_REQUIRED"
    | "DENIAL_REASON_REQUIRED";

  constructor(
    code:
      | "APPLICATION_NOT_FOUND"
      | "TIER_REQUIRED"
      | "INVALID_TIER"
      | "SENIOR_OVERRIDE_CONFIRMATION_REQUIRED"
      | "DENIAL_REASON_REQUIRED",
    message: string
  ) {
    super(message);
    this.code = code;
  }
}

async function resolveActorMemberId(input: {
  tx: Prisma.TransactionClient;
  actorMemberId: string;
}): Promise<string | null> {
  const actor = await input.tx.member.findUnique({
    where: { id: input.actorMemberId },
    select: { id: true },
  });
  return actor?.id ?? null;
}

export async function approveMembershipApplication(input: {
  applicationId: string;
  reviewer: {
    memberId: string;
    email: string;
  };
  assignedPricingTierId: string;
  disabledVeteranApproved: boolean;
  confirmSeniorOverride: boolean;
}) {
  if (!input.applicationId || !input.assignedPricingTierId) {
    throw new ApplicationApprovalError(
      "TIER_REQUIRED",
      "Pricing tier selection is required."
    );
  }

  return prisma.$transaction(async (tx) => {
    const appRecord = await tx.membershipApplication.findUnique({
      where: { id: input.applicationId },
      include: {
        membershipYear: true,
      },
    });

    if (!appRecord) {
      throw new ApplicationApprovalError("APPLICATION_NOT_FOUND", "Application not found.");
    }

    const tier = await tx.pricingTier.findUnique({
      where: { id: input.assignedPricingTierId },
    });
    if (!tier || !tier.isActive || tier.membershipYearId !== appRecord.membershipYearId) {
      throw new ApplicationApprovalError(
        "INVALID_TIER",
        "Invalid pricing tier selected."
      );
    }

    const computedSignupDay = determineSignupDay({
      year: appRecord.membershipYear.year,
      signupDate: appRecord.membershipYear.signupDate,
    });
    const seniorAuto = isSeniorOnDate(appRecord.applicantDob, computedSignupDay);
    const isSeniorOverride = seniorAuto && tier.code !== "SENIOR";
    if (isSeniorOverride && !input.confirmSeniorOverride) {
      throw new ApplicationApprovalError(
        "SENIOR_OVERRIDE_CONFIRMATION_REQUIRED",
        "Senior auto-pricing override requires confirmation."
      );
    }

    const disabledVetApprovedValue = appRecord.requestedDisabledVeteranDiscount
      ? input.disabledVeteranApproved
      : false;

    const updatedApplication = await tx.membershipApplication.update({
      where: { id: appRecord.id },
      data: {
        status: "APPROVED",
        assignedPricingTierId: tier.id,
        reviewedAt: new Date(),
        reviewedByMemberId: null,
        reviewedByEmail: input.reviewer.email,
        denialReason: null,
        disabledVeteranApproved: disabledVetApprovedValue,
        seniorAutoApplied: seniorAuto,
      },
    });

    const actorMemberId = await resolveActorMemberId({
      tx,
      actorMemberId: input.reviewer.memberId,
    });

    await tx.auditLog.create({
      data: {
        action: "APPLICATION_APPROVED",
        actorMemberId,
        targetMemberId: appRecord.createdMemberId,
        meta: {
          membershipApplicationId: appRecord.id,
          membershipYearId: appRecord.membershipYearId,
          applicantEmail: appRecord.applicantEmail,
          assignedPricingTierId: tier.id,
          assignedPricingTierCode: tier.code,
          disabledVeteranApproved: disabledVetApprovedValue,
          seniorAutoApplied: seniorAuto,
          seniorOverrideApplied: isSeniorOverride,
          reviewedByEmail: input.reviewer.email,
        },
      },
    });

    return updatedApplication;
  });
}

export async function denyMembershipApplication(input: {
  applicationId: string;
  reviewer: {
    memberId: string;
    email: string;
  };
  denialReason: string;
}) {
  const denialReason = input.denialReason.trim();
  if (!input.applicationId) {
    throw new ApplicationApprovalError("APPLICATION_NOT_FOUND", "Application not found.");
  }
  if (!denialReason) {
    throw new ApplicationApprovalError(
      "DENIAL_REASON_REQUIRED",
      "Denial reason is required."
    );
  }

  return prisma.$transaction(async (tx) => {
    const appRecord = await tx.membershipApplication.findUnique({
      where: { id: input.applicationId },
      select: {
        id: true,
        createdMemberId: true,
        membershipYearId: true,
      },
    });

    if (!appRecord) {
      throw new ApplicationApprovalError("APPLICATION_NOT_FOUND", "Application not found.");
    }

    const updatedApplication = await tx.membershipApplication.update({
      where: { id: appRecord.id },
      data: {
        status: "DENIED",
        denialReason,
        reviewedAt: new Date(),
        reviewedByMemberId: null,
        reviewedByEmail: input.reviewer.email,
        assignedPricingTierId: null,
        disabledVeteranApproved: false,
      },
    });

    const actorMemberId = await resolveActorMemberId({
      tx,
      actorMemberId: input.reviewer.memberId,
    });

    await tx.auditLog.create({
      data: {
        action: "APPLICATION_DENIED",
        actorMemberId,
        targetMemberId: appRecord.createdMemberId,
        meta: {
          membershipApplicationId: appRecord.id,
          membershipYearId: appRecord.membershipYearId,
          denialReason,
          reviewedByEmail: input.reviewer.email,
        },
      },
    });

    return updatedApplication;
  });
}
