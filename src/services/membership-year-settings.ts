import { prisma } from "@/lib/db";
import { buildMembershipYearDates, getCurrentYearInNewYork } from "@/lib/membership-dates";
import {
  createOrOpenMembershipYear,
  DEFAULT_MEMBERSHIP_CAP,
} from "@/services/membership";

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
  };
}

export async function getOrCreateMembershipYearSettings(yearInput?: number) {
  const year = ensureValidYear(yearInput ?? getCurrentYearInNewYork());
  const membershipYear = await createOrOpenMembershipYear(year);
  return toSettingsResponse(membershipYear);
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

  return toSettingsResponse(updated);
}
