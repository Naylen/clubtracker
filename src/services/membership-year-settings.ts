import { prisma } from "@/lib/db";
import { buildMembershipYearDates, getCurrentYearInNewYork } from "@/lib/membership-dates";
import {
  countActiveEnrollments,
  createOrOpenMembershipYear,
  DEFAULT_MEMBERSHIP_CAP,
  getLateRenewalPolicy,
  setLateRenewalPolicy,
} from "@/services/membership";
import { getApplicationWindow, setApplicationWindow } from "@/services/operations-state";

export type MembershipYearSettingsResponse = {
  id: string;
  year: number;
  startsAt: string;
  endsAt: string;
  renewalOpensAt: string;
  renewalDueAt: string;
  membershipCap: number;
  standardPriceCents: number;
  discountPriceCents: number;
  signupEnabled: boolean;
  signupDate: string | null;
  applicationEnabled: boolean;
  applicationOpensAt: string | null;
  applicationClosesAt: string | null;
  lateRenewalsEnabled: boolean;
  lateRenewalPolicyNotes: string;
  activeEnrollments: number;
  capacityRemaining: number;
};

type MembershipYearSettingsUpdateInput = {
  renewalOpensAt?: string;
  renewalDueAt?: string;
  membershipCap?: number;
  standardPriceCents?: number;
  discountPriceCents?: number;
  signupEnabled?: boolean;
  signupDate?: string | null;
  applicationEnabled?: boolean;
  applicationOpensAt?: string | null;
  applicationClosesAt?: string | null;
  lateRenewalsEnabled?: boolean;
  lateRenewalPolicyNotes?: string;
};

function ensureValidYear(year: number): number {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Invalid year.");
  }
  return year;
}

function parseDateInput(value: string, { endOfDay = false }: { endOfDay?: boolean } = {}): Date {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Date value is required.");
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const suffix = endOfDay ? "23:59:59.999-05:00" : "00:00:00-05:00";
    const parsed = new Date(`${trimmed}T${suffix}`);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid date: ${trimmed}`);
    }
    return parsed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${trimmed}`);
  }
  return parsed;
}

function getYearInNewYork(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
    }).format(date)
  );
}

function toSettingsResponse(input: {
  id: string;
  year: number;
  startsAt: Date;
  endsAt: Date;
  renewalOpensAt: Date;
  renewalDueAt: Date;
  membershipCap: number;
  standardPriceCents: number;
  discountPriceCents: number;
  signupEnabled: boolean;
  signupDate: Date | null;
  applicationEnabled: boolean;
  applicationWindow: {
    opensAt: string | null;
    closesAt: string | null;
  };
  lateRenewalPolicy: {
    enabled: boolean;
    policyNotes: string;
  };
  activeEnrollments: number;
}): MembershipYearSettingsResponse {
  return {
    id: input.id,
    year: input.year,
    startsAt: input.startsAt.toISOString(),
    endsAt: input.endsAt.toISOString(),
    renewalOpensAt: input.renewalOpensAt.toISOString(),
    renewalDueAt: input.renewalDueAt.toISOString(),
    membershipCap: input.membershipCap,
    standardPriceCents: input.standardPriceCents,
    discountPriceCents: input.discountPriceCents,
    signupEnabled: input.signupEnabled,
    signupDate: input.signupDate?.toISOString() ?? null,
    applicationEnabled: input.applicationEnabled,
    applicationOpensAt: input.applicationWindow.opensAt,
    applicationClosesAt: input.applicationWindow.closesAt,
    lateRenewalsEnabled: input.lateRenewalPolicy.enabled,
    lateRenewalPolicyNotes: input.lateRenewalPolicy.policyNotes,
    activeEnrollments: input.activeEnrollments,
    capacityRemaining: Math.max(0, input.membershipCap - input.activeEnrollments),
  };
}

export async function getOrCreateMembershipYearSettings(yearInput?: number) {
  const year = ensureValidYear(yearInput ?? getCurrentYearInNewYork());
  const membershipYear = await createOrOpenMembershipYear(year);
  const [applicationWindow, lateRenewalPolicy, activeEnrollments] = await Promise.all([
    getApplicationWindow(year),
    getLateRenewalPolicy(),
    countActiveEnrollments(membershipYear.id),
  ]);
  return toSettingsResponse({
    ...membershipYear,
    applicationWindow,
    lateRenewalPolicy,
    activeEnrollments,
  });
}

export async function updateMembershipYearSettings(input: {
  year: number;
  data: MembershipYearSettingsUpdateInput;
}) {
  const year = ensureValidYear(input.year);
  await createOrOpenMembershipYear(year);

  const current = await prisma.membershipYear.findUnique({ where: { year } });
  if (!current) {
    throw new Error("Membership year not found.");
  }

  const renewalOpensAt = input.data.renewalOpensAt
    ? parseDateInput(input.data.renewalOpensAt)
    : current.renewalOpensAt;
  const renewalDueAt = input.data.renewalDueAt
    ? parseDateInput(input.data.renewalDueAt, { endOfDay: true })
    : current.renewalDueAt;
  const membershipCap =
    input.data.membershipCap !== undefined ? Number(input.data.membershipCap) : current.membershipCap;
  const standardPriceCents =
    input.data.standardPriceCents !== undefined
      ? Math.round(Number(input.data.standardPriceCents))
      : current.standardPriceCents;
  const discountPriceCents =
    input.data.discountPriceCents !== undefined
      ? Math.round(Number(input.data.discountPriceCents))
      : current.discountPriceCents;
  const signupEnabled =
    input.data.signupEnabled !== undefined ? Boolean(input.data.signupEnabled) : current.signupEnabled;
  const applicationEnabled =
    input.data.applicationEnabled !== undefined
      ? Boolean(input.data.applicationEnabled)
      : current.applicationEnabled;
  const signupDate =
    input.data.signupDate === undefined
      ? current.signupDate
      : input.data.signupDate === null
        ? null
        : typeof input.data.signupDate !== "string"
          ? null
          : input.data.signupDate.trim() === ""
            ? null
            : parseDateInput(input.data.signupDate);

  if (renewalOpensAt > renewalDueAt) {
    throw new Error("Renewal open date must be on or before renewal due date.");
  }

  if (getYearInNewYork(renewalDueAt) !== year) {
    throw new Error("Renewal due date must be within the selected membership year.");
  }

  if (membershipCap < 1 || membershipCap > DEFAULT_MEMBERSHIP_CAP) {
    throw new Error(`Membership cap must be between 1 and ${DEFAULT_MEMBERSHIP_CAP}.`);
  }

  if (standardPriceCents < 0 || discountPriceCents < 0) {
    throw new Error("Prices must be zero or greater.");
  }

  if (discountPriceCents > standardPriceCents) {
    throw new Error("Discount price cannot exceed standard price.");
  }

  if (signupDate && getYearInNewYork(signupDate) !== year) {
    throw new Error("Signup date must be within the selected membership year.");
  }

  const termDates = buildMembershipYearDates(year);

  const updated = await prisma.membershipYear.update({
    where: { year },
    data: {
      startsAt: termDates.startsAt,
      endsAt: termDates.endsAt,
      renewalOpensAt,
      renewalDueAt,
      membershipCap,
      standardPriceCents,
      discountPriceCents,
      signupEnabled,
      signupDate,
      applicationEnabled,
    },
  });

  const lateRenewalsEnabled =
    input.data.lateRenewalsEnabled !== undefined
      ? Boolean(input.data.lateRenewalsEnabled)
      : undefined;
  const lateRenewalPolicyNotes =
    input.data.lateRenewalPolicyNotes !== undefined
      ? String(input.data.lateRenewalPolicyNotes)
      : undefined;

  if (lateRenewalsEnabled !== undefined || lateRenewalPolicyNotes !== undefined) {
    const currentLatePolicy = await getLateRenewalPolicy();
    await setLateRenewalPolicy({
      enabled: lateRenewalsEnabled ?? currentLatePolicy.enabled,
      policyNotes: lateRenewalPolicyNotes ?? currentLatePolicy.policyNotes,
    });
  }

  if (
    input.data.applicationOpensAt !== undefined ||
    input.data.applicationClosesAt !== undefined
  ) {
    const currentWindow = await getApplicationWindow(year);
    await setApplicationWindow({
      year,
      opensAt:
        input.data.applicationOpensAt !== undefined
          ? input.data.applicationOpensAt
          : currentWindow.opensAt,
      closesAt:
        input.data.applicationClosesAt !== undefined
          ? input.data.applicationClosesAt
          : currentWindow.closesAt,
    });
  }

  const [applicationWindow, lateRenewalPolicy, activeEnrollments] = await Promise.all([
    getApplicationWindow(year),
    getLateRenewalPolicy(),
    countActiveEnrollments(updated.id),
  ]);

  return toSettingsResponse({
    ...updated,
    applicationWindow,
    lateRenewalPolicy,
    activeEnrollments,
  });
}
