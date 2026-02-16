const CLUB_TIME_ZONE = "America/New_York";

type DateInput = string | Date | null | undefined;

export type ApplicationGatingSettings = {
  applicationEnabled: boolean;
  applicationOpensAt: DateInput;
  applicationClosesAt: DateInput;
  // Signup-day settings are informational in P1 and do not gate public /apply.
  signupEnabled: boolean;
  signupDate: DateInput;
  membershipCap?: number;
  activeEnrollments?: number;
};

function toDateKeyInNewYork(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function toDateKey(value: DateInput): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return toDateKeyInNewYork(value);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return toDateKeyInNewYork(parsed);
}

function formatDateKey(dateKey: string): string {
  const [yearString, monthString, dayString] = dateKey.split("-");
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);

  if (!year || !month || !day) {
    return dateKey;
  }

  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: CLUB_TIME_ZONE,
  }).format(date);
}

export function explainApplicationsClosed(
  settings: ApplicationGatingSettings,
  now = new Date()
): { reasons: string[] } {
  const reasons: string[] = [];
  const nowKey = toDateKeyInNewYork(now);

  if (!settings.applicationEnabled) {
    reasons.push("Applications are currently closed by the club.");
    return { reasons };
  }

  const openKey = toDateKey(settings.applicationOpensAt);
  if (openKey && nowKey < openKey) {
    reasons.push(`Applications open on ${formatDateKey(openKey)}.`);
  }

  const closeKey = toDateKey(settings.applicationClosesAt);
  if (closeKey && nowKey > closeKey) {
    reasons.push(`Applications closed on ${formatDateKey(closeKey)}.`);
  }

  if (
    typeof settings.membershipCap === "number" &&
    typeof settings.activeEnrollments === "number" &&
    settings.activeEnrollments >= settings.membershipCap
  ) {
    reasons.push("Applications are paused because membership capacity is currently full.");
  }

  return { reasons };
}

export function isApplicationsOpenNow(
  settings: ApplicationGatingSettings,
  now = new Date()
): boolean {
  return explainApplicationsClosed(settings, now).reasons.length === 0;
}
