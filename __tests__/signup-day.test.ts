import { describe, expect, it } from "vitest";
import {
  calculateAgeOnDate,
  determineSignupDay,
  getFirstSaturdayInFebruary,
} from "@/lib/membership-dates";

function asNyDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

describe("signup day calculation", () => {
  it("returns first Saturday in February when no override exists", () => {
    const signupDay = getFirstSaturdayInFebruary(2026);
    expect(asNyDate(signupDay)).toBe("02/07/2026");
  });

  it("uses signupDate override when provided", () => {
    const override = new Date("2026-02-14T12:00:00-05:00");
    const signupDay = determineSignupDay({
      year: 2026,
      signupDate: override,
    });
    expect(signupDay.toISOString()).toBe(override.toISOString());
  });
});

describe("age on date calculation", () => {
  it("treats birthday on signup day as reaching the new age", () => {
    const dob = new Date("1961-02-07T00:00:00Z");
    const signupDay = new Date("2026-02-07T12:00:00-05:00");
    expect(calculateAgeOnDate(dob, signupDay)).toBe(65);
  });

  it("keeps age one year lower before birthday", () => {
    const dob = new Date("1961-02-07T00:00:00Z");
    const dayBefore = new Date("2026-02-06T12:00:00-05:00");
    expect(calculateAgeOnDate(dob, dayBefore)).toBe(64);
  });
});
