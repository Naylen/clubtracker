import { describe, expect, it } from "vitest";
import { buildMembershipYearDates } from "@/lib/membership-dates";

function asEasternDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return { year, month, day };
}

describe("create/open current year date logic", () => {
  it("sets Jan 1 start, Dec 31 end, and Jan 31 renewal due in America/New_York", () => {
    const dates = buildMembershipYearDates(2026);

    expect(asEasternDateParts(dates.startsAt)).toEqual({
      year: 2026,
      month: 1,
      day: 1,
    });
    expect(asEasternDateParts(dates.endsAt)).toEqual({
      year: 2026,
      month: 12,
      day: 31,
    });
    expect(asEasternDateParts(dates.renewalOpensAt)).toEqual({
      year: 2026,
      month: 1,
      day: 1,
    });
    expect(asEasternDateParts(dates.renewalDueAt)).toEqual({
      year: 2026,
      month: 1,
      day: 31,
    });
  });
});
