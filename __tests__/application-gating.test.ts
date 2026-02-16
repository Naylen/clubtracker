import { describe, expect, it } from "vitest";
import { isApplicationsOpenNow } from "@/services/application-gating";

const now = new Date("2026-02-07T14:00:00-05:00");

describe("application gating rules", () => {
  it("is closed when Applications Open toggle is off", () => {
    expect(
      isApplicationsOpenNow(
        {
          applicationEnabled: false,
          applicationOpensAt: null,
          applicationClosesAt: null,
          signupEnabled: false,
          signupDate: null,
        },
        now
      )
    ).toBe(false);
  });

  it("is open when toggle is on with no dates and signup day scheduling off", () => {
    expect(
      isApplicationsOpenNow(
        {
          applicationEnabled: true,
          applicationOpensAt: null,
          applicationClosesAt: null,
          signupEnabled: false,
          signupDate: null,
        },
        now
      )
    ).toBe(true);
  });

  it("is closed when open date is tomorrow", () => {
    expect(
      isApplicationsOpenNow(
        {
          applicationEnabled: true,
          applicationOpensAt: "2026-02-08T00:00:00.000Z",
          applicationClosesAt: null,
          signupEnabled: false,
          signupDate: null,
        },
        now
      )
    ).toBe(false);
  });

  it("is closed when close date is yesterday", () => {
    expect(
      isApplicationsOpenNow(
        {
          applicationEnabled: true,
          applicationOpensAt: null,
          applicationClosesAt: "2026-02-06T23:59:59.999Z",
          signupEnabled: false,
          signupDate: null,
        },
        now
      )
    ).toBe(false);
  });

  it("ignores signup day scheduling when no dedicated signup-day gate is configured", () => {
    expect(
      isApplicationsOpenNow(
        {
          applicationEnabled: true,
          applicationOpensAt: null,
          applicationClosesAt: null,
          signupEnabled: true,
          signupDate: new Date("2026-02-07T00:00:00-05:00"),
        },
        now
      )
    ).toBe(true);
  });

  it("remains open even when signup day is tomorrow (informational only)", () => {
    expect(
      isApplicationsOpenNow(
        {
          applicationEnabled: true,
          applicationOpensAt: null,
          applicationClosesAt: null,
          signupEnabled: true,
          signupDate: new Date("2026-02-08T00:00:00-05:00"),
        },
        now
      )
    ).toBe(true);
  });
});
