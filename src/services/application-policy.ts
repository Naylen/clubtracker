import { Prisma, type MembershipYear, type PricingTier } from "@prisma/client";
import { prisma } from "@/lib/db";
import { determineSignupDay, calculateAgeOnDate } from "@/lib/membership-dates";

const SIGNUP_DAY_GATE_KEY_PREFIX = "applicationSignupDayGate";

export type SignupDayGateSettings = {
  enforceSignupDayWindow: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

export type PublicApplyReasonCode =
  | "OPEN"
  | "NO_CURRENT_YEAR"
  | "APPLICATIONS_TOGGLE_OFF"
  | "OUTSIDE_APPLICATION_WINDOW"
  | "OUTSIDE_SIGNUP_DAY_GATE"
  | "CAP_REACHED";

export type PublicApplyDecision = {
  allowed: boolean;
  reasonCode: PublicApplyReasonCode;
  message: string;
  signupDay: Date | null;
  gateStartsAt: Date | null;
  gateEndsAt: Date | null;
};

export type PublicApplicationWindow = {
  opensAt: string | null;
  closesAt: string | null;
};

function parseOptionalDate(value: string | null): Date | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(date);
}

function getNewYorkDateParts(date: Date): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: parts.find((part) => part.type === "year")?.value ?? "1970",
    month: parts.find((part) => part.type === "month")?.value ?? "01",
    day: parts.find((part) => part.type === "day")?.value ?? "01",
  };
}

function getNewYorkOffset(date: Date): string {
  const offsetValue = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")
    ?.value;

  if (!offsetValue) {
    return "-05:00";
  }

  const normalized = offsetValue.replace("GMT", "");
  if (!normalized || normalized === "0") {
    return "+00:00";
  }

  const sign = normalized.startsWith("-") ? "-" : "+";
  const numeric = normalized.replace(/[+-]/g, "");
  const [hoursRaw, minutesRaw] = numeric.split(":");
  const hours = hoursRaw.padStart(2, "0");
  const minutes = (minutesRaw ?? "00").padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function buildDayBoundary(date: Date, time: "start" | "end"): Date {
  const { year, month, day } = getNewYorkDateParts(date);
  const offset = getNewYorkOffset(date);
  const suffix = time === "start" ? "00:00:00.000" : "23:59:59.999";
  return new Date(`${year}-${month}-${day}T${suffix}${offset}`);
}

export function getSignupDayGateKey(year: number): string {
  return `${SIGNUP_DAY_GATE_KEY_PREFIX}:${year}`;
}

export async function getApplicationSignupDayGate(year: number): Promise<SignupDayGateSettings> {
  const setting = await prisma.systemSettings.findUnique({
    where: { key: getSignupDayGateKey(year) },
  });

  if (!setting) {
    return {
      enforceSignupDayWindow: false,
      startsAt: null,
      endsAt: null,
    };
  }

  const value = setting.value as Prisma.JsonObject;
  return {
    enforceSignupDayWindow: value.enforceSignupDayWindow === true,
    startsAt: typeof value.startsAt === "string" ? value.startsAt : null,
    endsAt: typeof value.endsAt === "string" ? value.endsAt : null,
  };
}

export async function setApplicationSignupDayGate(input: {
  year: number;
  enforceSignupDayWindow: boolean;
  startsAt: string | null;
  endsAt: string | null;
}): Promise<SignupDayGateSettings> {
  const startsAt = parseOptionalDate(input.startsAt)?.toISOString() ?? null;
  const endsAt = parseOptionalDate(input.endsAt)?.toISOString() ?? null;

  if (startsAt && endsAt && new Date(startsAt) > new Date(endsAt)) {
    throw new Error("Signup day gate end must be on or after start.");
  }

  const payload: SignupDayGateSettings = {
    enforceSignupDayWindow: Boolean(input.enforceSignupDayWindow),
    startsAt,
    endsAt,
  };

  await prisma.systemSettings.upsert({
    where: { key: getSignupDayGateKey(input.year) },
    update: { value: payload },
    create: {
      key: getSignupDayGateKey(input.year),
      value: payload,
    },
  });

  return payload;
}

export function resolveSignupDayGateWindow(input: {
  membershipYear: Pick<MembershipYear, "year" | "signupDate">;
  gate: SignupDayGateSettings;
}): {
  signupDay: Date;
  startsAt: Date | null;
  endsAt: Date | null;
} {
  // When signupDate is unset, the existing default is first Saturday in February.
  const signupDay = determineSignupDay({
    year: input.membershipYear.year,
    signupDate: input.membershipYear.signupDate,
  });

  if (!input.gate.enforceSignupDayWindow) {
    return {
      signupDay,
      startsAt: null,
      endsAt: null,
    };
  }

  const parsedStart = parseOptionalDate(input.gate.startsAt);
  const parsedEnd = parseOptionalDate(input.gate.endsAt);

  return {
    signupDay,
    startsAt: parsedStart ?? buildDayBoundary(signupDay, "start"),
    endsAt: parsedEnd ?? buildDayBoundary(signupDay, "end"),
  };
}

function isInsideWindowInclusive(input: {
  current: Date;
  startsAt: Date | null;
  endsAt: Date | null;
}): boolean {
  if (input.startsAt && input.current < input.startsAt) {
    return false;
  }
  if (input.endsAt && input.current > input.endsAt) {
    return false;
  }
  return true;
}

export function canPublicApply(input: {
  membershipYear: Pick<MembershipYear, "year" | "membershipCap" | "applicationEnabled" | "signupDate"> | null;
  applicationWindow: PublicApplicationWindow;
  signupGate: SignupDayGateSettings;
  activeEnrollments: number;
  asOf?: Date;
}): PublicApplyDecision {
  const now = input.asOf ?? new Date();

  if (!input.membershipYear) {
    return {
      allowed: false,
      reasonCode: "NO_CURRENT_YEAR",
      message: "Applications are closed while the current membership year is being prepared.",
      signupDay: null,
      gateStartsAt: null,
      gateEndsAt: null,
    };
  }

  const resolvedGate = resolveSignupDayGateWindow({
    membershipYear: input.membershipYear,
    gate: input.signupGate,
  });

  if (!input.membershipYear.applicationEnabled) {
    return {
      allowed: false,
      reasonCode: "APPLICATIONS_TOGGLE_OFF",
      message: "Applications are currently closed by the club.",
      signupDay: resolvedGate.signupDay,
      gateStartsAt: resolvedGate.startsAt,
      gateEndsAt: resolvedGate.endsAt,
    };
  }

  const applicationWindowStart = parseOptionalDate(input.applicationWindow.opensAt);
  const applicationWindowEnd = parseOptionalDate(input.applicationWindow.closesAt);
  if (
    !isInsideWindowInclusive({
      current: now,
      startsAt: applicationWindowStart,
      endsAt: applicationWindowEnd,
    })
  ) {
    const rangeMessage =
      applicationWindowStart || applicationWindowEnd
        ? ` Public window: ${
            applicationWindowStart ? formatDateTime(applicationWindowStart) : "immediately"
          } to ${applicationWindowEnd ? formatDateTime(applicationWindowEnd) : "until closed"}.`
        : "";
    return {
      allowed: false,
      reasonCode: "OUTSIDE_APPLICATION_WINDOW",
      message: `Applications are closed outside the configured public window.${rangeMessage}`.trim(),
      signupDay: resolvedGate.signupDay,
      gateStartsAt: resolvedGate.startsAt,
      gateEndsAt: resolvedGate.endsAt,
    };
  }

  if (input.activeEnrollments >= input.membershipYear.membershipCap) {
    return {
      allowed: false,
      reasonCode: "CAP_REACHED",
      message: "Applications are paused because membership capacity is currently full.",
      signupDay: resolvedGate.signupDay,
      gateStartsAt: resolvedGate.startsAt,
      gateEndsAt: resolvedGate.endsAt,
    };
  }

  if (
    input.signupGate.enforceSignupDayWindow &&
    !isInsideWindowInclusive({
      current: now,
      startsAt: resolvedGate.startsAt,
      endsAt: resolvedGate.endsAt,
    })
  ) {
    return {
      allowed: false,
      reasonCode: "OUTSIDE_SIGNUP_DAY_GATE",
      message: `Applications are only available during the signup day window (${formatDateTime(
        resolvedGate.startsAt ?? resolvedGate.signupDay
      )} to ${formatDateTime(resolvedGate.endsAt ?? resolvedGate.signupDay)}).`,
      signupDay: resolvedGate.signupDay,
      gateStartsAt: resolvedGate.startsAt,
      gateEndsAt: resolvedGate.endsAt,
    };
  }

  return {
    allowed: true,
    reasonCode: "OPEN",
    message: "Applications are open.",
    signupDay: resolvedGate.signupDay,
    gateStartsAt: resolvedGate.startsAt,
    gateEndsAt: resolvedGate.endsAt,
  };
}

export function computeApplicantAgeOnSignupDay(
  dateOfBirth: Date | null,
  signupDay: Date
): number | null {
  if (!dateOfBirth) {
    return null;
  }
  return calculateAgeOnDate(dateOfBirth, signupDay);
}

export function determineRecommendedTier(input: {
  ageOnSignupDay: number | null;
  dvRequested: boolean;
  availableTiers: Array<Pick<PricingTier, "id" | "code" | "name" | "amountCents">>;
}): {
  tier: Pick<PricingTier, "id" | "code" | "name" | "amountCents"> | null;
  suggestedTierCode: string;
  seniorEligible: boolean;
} {
  const seniorEligible = input.ageOnSignupDay !== null && input.ageOnSignupDay >= 65;

  const preferredOrder = seniorEligible
    ? ["SENIOR", "STANDARD", "DISABLED_VETERAN"]
    : input.dvRequested
      ? ["DISABLED_VETERAN", "STANDARD", "SENIOR"]
      : ["STANDARD", "SENIOR", "DISABLED_VETERAN"];

  const tierByCode = new Map(input.availableTiers.map((tier) => [tier.code, tier]));
  for (const code of preferredOrder) {
    const tier = tierByCode.get(code);
    if (tier) {
      return {
        tier,
        suggestedTierCode: code,
        seniorEligible,
      };
    }
  }

  return {
    tier: input.availableTiers[0] ?? null,
    suggestedTierCode: seniorEligible
      ? "SENIOR"
      : input.dvRequested
        ? "DISABLED_VETERAN"
        : "STANDARD",
    seniorEligible,
  };
}

