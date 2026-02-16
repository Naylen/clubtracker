import { ApplicationStatus, MemberStatus, type MembershipYear } from "@prisma/client";
import { prisma } from "@/lib/db";
import { validateStructuredAddress } from "@/lib/address";
import { parseDisciplineInterests } from "@/lib/discipline";
import { getCurrentYearInNewYork } from "@/lib/membership-dates";
import { hashPassword } from "@/lib/password";
import { explainApplicationsClosed, isApplicationsOpenNow } from "@/services/application-gating";
import { countActiveEnrollments } from "@/services/membership";
import { getApplicationWindow } from "@/services/operations-state";

export class ApplicationFlowError extends Error {
  code:
    | "APPLICATIONS_CLOSED"
    | "ACTIVE_MEMBER_EXISTS"
    | "ACCOUNT_EXISTS"
    | "ACCOUNT_NOT_FOUND"
    | "INVALID_APPLICATION_INPUT";

  constructor(
    code:
      | "APPLICATIONS_CLOSED"
      | "ACTIVE_MEMBER_EXISTS"
      | "ACCOUNT_EXISTS"
      | "ACCOUNT_NOT_FOUND"
      | "INVALID_APPLICATION_INPUT",
    message: string
  ) {
    super(message);
    this.code = code;
  }
}

export type CurrentPublicApplicationState = {
  membershipYear: MembershipYear | null;
  decision: {
    allowed: boolean;
    message: string;
    reasons: string[];
    signupDay: Date | null;
  };
};

type BaseInput = {
  membershipYearId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  street1: string;
  street2: string | null;
  city: string;
  state: string;
  zip: string;
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
  const state = await getCurrentPublicApplicationState();
  if (!state.membershipYear || !state.decision.allowed) {
    throw new ApplicationFlowError("APPLICATIONS_CLOSED", state.decision.message);
  }
  return state.membershipYear;
}

export async function getCurrentPublicApplicationState(
  asOf?: Date
): Promise<CurrentPublicApplicationState> {
  const currentYear = getCurrentYearInNewYork();
  const membershipYear = await prisma.membershipYear.findUnique({
    where: { year: currentYear },
  });

  const [applicationWindow, activeEnrollments] = await Promise.all([
    getApplicationWindow(currentYear),
    membershipYear ? countActiveEnrollments(membershipYear.id) : Promise.resolve(0),
  ]);

  if (!membershipYear) {
    return {
      membershipYear: null,
      decision: {
        allowed: false,
        reasons: ["Applications are currently closed by the club."],
        message: "Applications are currently closed by the club.",
        signupDay: null,
      },
    };
  }

  const reasons = explainApplicationsClosed(
    {
      applicationEnabled: membershipYear.applicationEnabled,
      applicationOpensAt: applicationWindow.opensAt,
      applicationClosesAt: applicationWindow.closesAt,
      // Signup day is informational unless a dedicated gate setting is added.
      signupEnabled: false,
      signupDate: null,
      membershipCap: membershipYear.membershipCap,
      activeEnrollments,
    },
    asOf
  ).reasons;
  const allowed = isApplicationsOpenNow(
    {
      applicationEnabled: membershipYear.applicationEnabled,
      applicationOpensAt: applicationWindow.opensAt,
      applicationClosesAt: applicationWindow.closesAt,
      signupEnabled: false,
      signupDate: null,
      membershipCap: membershipYear.membershipCap,
      activeEnrollments,
    },
    asOf
  );

  return {
    membershipYear,
    decision: {
      allowed,
      reasons,
      message: reasons[0] ?? "Applications are open.",
      signupDay: membershipYear.signupDate,
    },
  };
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
  const validatedAddress = validateStructuredAddress({
    street1: input.street1,
    street2: input.street2,
    city: input.city,
    state: input.state,
    zip: input.zip,
  });
  if (validatedAddress.errors.length > 0) {
    throw new ApplicationFlowError("INVALID_APPLICATION_INPUT", validatedAddress.errors[0]);
  }

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
      street1: validatedAddress.value.street1,
      street2: validatedAddress.value.street2,
      city: validatedAddress.value.city,
      state: validatedAddress.value.state,
      zip: validatedAddress.value.zip,
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
      applicantStreet1: validatedAddress.value.street1,
      applicantStreet2: validatedAddress.value.street2,
      applicantCity: validatedAddress.value.city,
      applicantState: validatedAddress.value.state,
      applicantZip: validatedAddress.value.zip,
      applicantDob: input.dob,
      requestedDisabledVeteranDiscount: input.requestedDisabledVeteranDiscount,
      disabledVeteranApproved: null,
      assignedPricingTierId: null,
      status: ApplicationStatus.SUBMITTED,
      submittedAt: new Date(),
      reviewedAt: null,
      reviewedByMemberId: null,
      reviewedByEmail: null,
      denialReason: null,
      createdMemberId: createdMember.id,
    },
    create: {
      membershipYearId: input.membershipYearId,
      applicantEmail: email,
      applicantFirstName: input.firstName,
      applicantLastName: input.lastName,
      applicantPhone: input.phone,
      applicantStreet1: validatedAddress.value.street1,
      applicantStreet2: validatedAddress.value.street2,
      applicantCity: validatedAddress.value.city,
      applicantState: validatedAddress.value.state,
      applicantZip: validatedAddress.value.zip,
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
  const validatedAddress = validateStructuredAddress({
    street1: input.street1,
    street2: input.street2,
    city: input.city,
    state: input.state,
    zip: input.zip,
  });
  if (validatedAddress.errors.length > 0) {
    throw new ApplicationFlowError("INVALID_APPLICATION_INPUT", validatedAddress.errors[0]);
  }

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
      street1: validatedAddress.value.street1,
      street2: validatedAddress.value.street2,
      city: validatedAddress.value.city,
      state: validatedAddress.value.state,
      zip: validatedAddress.value.zip,
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
      applicantStreet1: validatedAddress.value.street1,
      applicantStreet2: validatedAddress.value.street2,
      applicantCity: validatedAddress.value.city,
      applicantState: validatedAddress.value.state,
      applicantZip: validatedAddress.value.zip,
      applicantDob: input.dob,
      requestedDisabledVeteranDiscount: input.requestedDisabledVeteranDiscount,
      disabledVeteranApproved: null,
      assignedPricingTierId: null,
      status: ApplicationStatus.SUBMITTED,
      submittedAt: new Date(),
      reviewedAt: null,
      reviewedByMemberId: null,
      reviewedByEmail: null,
      denialReason: null,
      createdMemberId: account.id,
    },
    create: {
      membershipYearId: input.membershipYearId,
      applicantEmail: account.email,
      applicantFirstName: input.firstName,
      applicantLastName: input.lastName,
      applicantPhone: input.phone,
      applicantStreet1: validatedAddress.value.street1,
      applicantStreet2: validatedAddress.value.street2,
      applicantCity: validatedAddress.value.city,
      applicantState: validatedAddress.value.state,
      applicantZip: validatedAddress.value.zip,
      applicantDob: input.dob,
      requestedDisabledVeteranDiscount: input.requestedDisabledVeteranDiscount,
      status: ApplicationStatus.SUBMITTED,
      submittedAt: new Date(),
      createdMemberId: account.id,
    },
  });

  return { account, application };
}
