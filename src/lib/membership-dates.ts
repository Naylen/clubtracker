export function getCurrentYearInNewYork(date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
    }).format(date)
  );
}

export function buildMembershipYearDates(year: number) {
  return {
    startsAt: new Date(`${year}-01-01T00:00:00-05:00`),
    endsAt: new Date(`${year}-12-31T23:59:59.999-05:00`),
    renewalOpensAt: new Date(`${year}-01-01T00:00:00-05:00`),
    renewalDueAt: new Date(`${year}-01-31T23:59:59.999-05:00`),
  };
}

export function calculateAge(dob: Date, asOf = new Date()): number {
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const monthDifference = asOf.getUTCMonth() - dob.getUTCMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && asOf.getUTCDate() < dob.getUTCDate())
  ) {
    age -= 1;
  }

  return age;
}

export function isSeniorFromDob(dob: Date | null): boolean {
  if (!dob) {
    return false;
  }
  return calculateAge(dob) >= 65;
}

export function isUnder18FromDob(dob: Date | null): boolean {
  if (!dob) {
    return false;
  }
  return calculateAge(dob) < 18;
}
