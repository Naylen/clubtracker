import { Prisma, type MembershipYear } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentYearInNewYork } from "@/lib/membership-dates";
import { countActiveEnrollments, getLateRenewalPolicy } from "@/services/membership";

const APPLICATION_WINDOW_KEY_PREFIX = "applicationWindow";

export type ApplicationWindow = {
  opensAt: string | null;
  closesAt: string | null;
};

function parseOptionalDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoOrNull(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export function getApplicationWindowKey(year: number): string {
  return `${APPLICATION_WINDOW_KEY_PREFIX}:${year}`;
}

export async function getApplicationWindow(year: number): Promise<ApplicationWindow> {
  const setting = await prisma.systemSettings.findUnique({
    where: { key: getApplicationWindowKey(year) },
  });

  if (!setting) {
    return { opensAt: null, closesAt: null };
  }

  const value = setting.value as Prisma.JsonObject;
  const opensAt =
    typeof value.opensAt === "string" && parseOptionalDate(value.opensAt)
      ? value.opensAt
      : null;
  const closesAt =
    typeof value.closesAt === "string" && parseOptionalDate(value.closesAt)
      ? value.closesAt
      : null;

  return { opensAt, closesAt };
}

export async function setApplicationWindow(input: {
  year: number;
  opensAt: string | null;
  closesAt: string | null;
}): Promise<ApplicationWindow> {
  const parsedOpen = parseOptionalDate(input.opensAt);
  const parsedClose = parseOptionalDate(input.closesAt);

  if (parsedOpen && parsedClose && parsedOpen > parsedClose) {
    throw new Error("Application window close date must be on or after open date.");
  }

  await prisma.systemSettings.upsert({
    where: { key: getApplicationWindowKey(input.year) },
    update: {
      value: {
        opensAt: toIsoOrNull(parsedOpen),
        closesAt: toIsoOrNull(parsedClose),
      },
    },
    create: {
      key: getApplicationWindowKey(input.year),
      value: {
        opensAt: toIsoOrNull(parsedOpen),
        closesAt: toIsoOrNull(parsedClose),
      },
    },
  });

  return {
    opensAt: toIsoOrNull(parsedOpen),
    closesAt: toIsoOrNull(parsedClose),
  };
}

export function isApplicationOpenNow(input: {
  membershipYear: Pick<MembershipYear, "applicationEnabled">;
  window: ApplicationWindow;
  asOf?: Date;
}): boolean {
  if (!input.membershipYear.applicationEnabled) {
    return false;
  }

  const now = input.asOf ?? new Date();
  const opensAt = parseOptionalDate(input.window.opensAt);
  const closesAt = parseOptionalDate(input.window.closesAt);

  if (opensAt && now < opensAt) {
    return false;
  }
  if (closesAt && now > closesAt) {
    return false;
  }

  return true;
}

export type CurrentYearOperationalState = {
  year: number;
  membershipYear: MembershipYear | null;
  applicationWindow: ApplicationWindow;
  applicationPublicOpen: boolean;
  activeEnrollments: number;
  activeMembers: number;
  pendingApplications: number;
  unpaidRenewals: number;
  capacityRemaining: number;
  lateRenewalsEnabled: boolean;
  alerts: string[];
};

export async function getCurrentYearOperationalState(): Promise<CurrentYearOperationalState> {
  const year = getCurrentYearInNewYork();
  const membershipYear = await prisma.membershipYear.findUnique({
    where: { year },
  });

  if (!membershipYear) {
    return {
      year,
      membershipYear: null,
      applicationWindow: { opensAt: null, closesAt: null },
      applicationPublicOpen: false,
      activeEnrollments: 0,
      activeMembers: 0,
      pendingApplications: 0,
      unpaidRenewals: 0,
      capacityRemaining: 0,
      lateRenewalsEnabled: false,
      alerts: [`Membership year ${year} is not created yet.`],
    };
  }

  const [window, latePolicy, activeEnrollments, activeMembers, pendingApplications, unpaidRenewals] =
    await Promise.all([
      getApplicationWindow(year),
      getLateRenewalPolicy(),
      countActiveEnrollments(membershipYear.id),
      prisma.member.count({
        where: {
          role: "MEMBER",
          isActive: true,
          status: "ACTIVE",
        },
      }),
      prisma.membershipApplication.count({
        where: {
          membershipYearId: membershipYear.id,
          status: "SUBMITTED",
        },
      }),
      prisma.membershipEnrollment.count({
        where: {
          membershipYearId: membershipYear.id,
          status: "PENDING_RENEWAL",
        },
      }),
    ]);

  const applicationPublicOpen = isApplicationOpenNow({
    membershipYear,
    window,
  });
  const capacityRemaining = Math.max(0, membershipYear.membershipCap - activeEnrollments);

  const alerts: string[] = [];
  if (!applicationPublicOpen) {
    alerts.push("Public applications are currently closed.");
  }
  if (capacityRemaining === 0) {
    alerts.push("Membership capacity is full.");
  }
  if (unpaidRenewals > 0) {
    alerts.push(`${unpaidRenewals} renewal(s) are still unpaid.`);
  }
  const now = new Date();
  if (now <= membershipYear.renewalDueAt) {
    const msUntilDue = membershipYear.renewalDueAt.getTime() - now.getTime();
    const daysUntilDue = Math.floor(msUntilDue / (24 * 60 * 60 * 1000));
    if (daysUntilDue <= 14) {
      alerts.push(`Renewal deadline is approaching in ${Math.max(daysUntilDue, 0)} day(s).`);
    }
  }

  return {
    year,
    membershipYear,
    applicationWindow: window,
    applicationPublicOpen,
    activeEnrollments,
    activeMembers,
    pendingApplications,
    unpaidRenewals,
    capacityRemaining,
    lateRenewalsEnabled: latePolicy.enabled,
    alerts,
  };
}
