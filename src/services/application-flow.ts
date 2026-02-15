import { ApplicationStatus, MemberStatus, type MembershipYear } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseDisciplineInterests } from "@/lib/discipline";
import { getCurrentYearInNewYork } from "@/lib/membership-dates";
import { hashPassword } from "@/lib/password";
import { getApplicationWindow, isApplicationOpenNow } from "@/services/operations-state";

export class ApplicationFlowError extends Error {
  code: "APPLICATIONS_CLOSED" | "ACTIVE_MEMBER_EXISTS" | "ACCOUNT_EXISTS" | "ACCOUNT_NOT_FOUND";

  constructor(
    code: "APPLICATIONS_CLOSED" | "ACTIVE_MEMBER_EXISTS" | "ACCOUNT_EXISTS" | "ACCOUNT_NOT_FOUND",
    message: string
  ) {
    super(message);
    this.code = code;
  }
}

type BaseInput = {
  membershipYearId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  address: string | null;
  dob: Date;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  disciplineInterests: string[];
  requestedDisabledVeteranDiscount: boolean;
};

type NewApplicantInput = BaseInput & {
  password: string;
};

function combineName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ").trim();
}

export async function getCurrentOpenApplicationYear(): Promise<MembershipYear> {
  const currentYear = getCurrentYearInNewYork();
  const membershipYear = await prisma.membershipYear.findUnique({
    where: { year: currentYear },
  });

  if (!membershipYear || !membershipYear.applicationEnabled) {
    throw new ApplicationFlowError(
      "APPLICATIONS_CLOSED",
      "Applications are currently closed for this membership year."
    );
  }

  const applicationWindow = await getApplicationWindow(currentYear);
  if (!isApplicationOpenNow({ membershipYear, window: applicationWindow })) {
    throw new ApplicationFlowError(
      "APPLICATIONS_CLOSED",
      "Applications are currently outside the configured public window."
    );
  }

  return membershipYear;
}

async function ensureMemberCanApply(input: { memberId: string; email: string; status: MemberStatus }) {
  if (input.status === MemberStatus.ACTIVE) {
    throw new ApplicationFlowError(
      "ACTIVE_MEMBER_EXISTS",
      `This email (${input.email}) belongs to an active member account.`
    );
  }

  const activeMembershipCount = await prisma.membershipEnrollment.count({
    where: {
      memberId: input.memberId,
      status: "ACTIVE",
    },
  });

  if (activeMembershipCount > 0) {
    throw new ApplicationFlowError(
      "ACTIVE_MEMBER_EXISTS",
      `This email (${input.email}) belongs to an active member account.`
    );
  }
}

export async function createApplicantAccountAndSubmit(input: NewApplicantInput) {
  const email = input.email.trim().toLowerCase();
  const existingMember = await prisma.member.findUnique({
    where: { email },
  });

  if (existingMember) {
    await ensureMemberCanApply({
      memberId: existingMember.id,
      email,
      status: existingMember.status,
    });
    throw new ApplicationFlowError("ACCOUNT_EXISTS", "Account already exists. Please sign in.");
  }

  const createdMember = await prisma.member.create({
    data: {
      name: combineName(input.firstName, input.lastName),
      email,
      passwordHash: hashPassword(input.password),
      phone: input.phone,
      address: input.address,
      dob: input.dob,
      emergencyContactName: input.emergencyContactName,
      emergencyContactRelationship: input.emergencyContactRelationship,
      emergencyContactPhone: input.emergencyContactPhone,
      disciplineInterests: parseDisciplineInterests(input.disciplineInterests),
      role: "MEMBER",
      status: MemberStatus.PENDING,
      isActive: true,
    },
  });

  const application = await prisma.membershipApplication.upsert({
    where: {
      membershipYearId_applicantEmail: {
        membershipYearId: input.membershipYearId,
        applicantEmail: email,
      },
    },
    update: {
      applicantFirstName: input.firstName,
      applicantLastName: input.lastName,
      applicantPhone: input.phone,
      applicantAddress: input.address,
      applicantDob: input.dob,
      requestedDisabledVeteranDiscount: input.requestedDisabledVeteranDiscount,
      disabledVeteranApproved: null,
      assignedPricingTierId: null,
      status: ApplicationStatus.SUBMITTED,
      submittedAt: new Date(),
      reviewedAt: null,
      reviewedByMemberId: null,
      denialReason: null,
      createdMemberId: createdMember.id,
    },
    create: {
      membershipYearId: input.membershipYearId,
      applicantEmail: email,
      applicantFirstName: input.firstName,
      applicantLastName: input.lastName,
      applicantPhone: input.phone,
      applicantAddress: input.address,
      applicantDob: input.dob,
      requestedDisabledVeteranDiscount: input.requestedDisabledVeteranDiscount,
      status: ApplicationStatus.SUBMITTED,
      submittedAt: new Date(),
      createdMemberId: createdMember.id,
    },
  });

  return { member: createdMember, application };
}

export async function submitApplicationForExistingAccount(input: BaseInput & { memberId: string }) {
  const account = await prisma.member.findUnique({
    where: { id: input.memberId },
  });

  if (!account) {
    throw new ApplicationFlowError("ACCOUNT_NOT_FOUND", "Account not found.");
  }

  await ensureMemberCanApply({
    memberId: account.id,
    email: account.email,
    status: account.status,
  });

  await prisma.member.update({
    where: { id: account.id },
    data: {
      name: combineName(input.firstName, input.lastName),
      phone: input.phone,
      address: input.address,
      dob: input.dob,
      emergencyContactName: input.emergencyContactName,
      emergencyContactRelationship: input.emergencyContactRelationship,
      emergencyContactPhone: input.emergencyContactPhone,
      disciplineInterests: parseDisciplineInterests(input.disciplineInterests),
      status: MemberStatus.PENDING,
      isActive: true,
    },
  });

  const application = await prisma.membershipApplication.upsert({
    where: {
      membershipYearId_applicantEmail: {
        membershipYearId: input.membershipYearId,
        applicantEmail: account.email,
      },
    },
    update: {
      applicantFirstName: input.firstName,
      applicantLastName: input.lastName,
      applicantPhone: input.phone,
      applicantAddress: input.address,
      applicantDob: input.dob,
      requestedDisabledVeteranDiscount: input.requestedDisabledVeteranDiscount,
      disabledVeteranApproved: null,
      assignedPricingTierId: null,
      status: ApplicationStatus.SUBMITTED,
      submittedAt: new Date(),
      reviewedAt: null,
      reviewedByMemberId: null,
      denialReason: null,
      createdMemberId: account.id,
    },
    create: {
      membershipYearId: input.membershipYearId,
      applicantEmail: account.email,
      applicantFirstName: input.firstName,
      applicantLastName: input.lastName,
      applicantPhone: input.phone,
      applicantAddress: input.address,
      applicantDob: input.dob,
      requestedDisabledVeteranDiscount: input.requestedDisabledVeteranDiscount,
      status: ApplicationStatus.SUBMITTED,
      submittedAt: new Date(),
      createdMemberId: account.id,
    },
  });

  return { account, application };
}
