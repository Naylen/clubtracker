import { describe, expect, it } from "vitest";
import { canPublicApply } from "@/services/application-policy";

const membershipYear = {
  year: 2026,
  membershipCap: 350,
  applicationEnabled: true,
  signupDate: new Date("2026-02-07T12:00:00-05:00"),
};

describe("public application policy", () => {
  it("returns closed when applications toggle is off", () => {
    const decision = canPublicApply({
      membershipYear: {
        ...membershipYear,
        applicationEnabled: false,
      },
      applicationWindow: { opensAt: null, closesAt: null },
      signupGate: {
        enforceSignupDayWindow: false,
        startsAt: null,
        endsAt: null,
      },
      activeEnrollments: 0,
      asOf: new Date("2026-01-10T12:00:00-05:00"),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("APPLICATIONS_TOGGLE_OFF");
  });

  it("returns open when toggle is on and now is inside public window", () => {
    const decision = canPublicApply({
      membershipYear,
      applicationWindow: {
        opensAt: "2026-01-01T00:00:00.000Z",
        closesAt: "2026-03-01T00:00:00.000Z",
      },
      signupGate: {
        enforceSignupDayWindow: false,
        startsAt: null,
        endsAt: null,
      },
      activeEnrollments: 0,
      asOf: new Date("2026-02-01T12:00:00-05:00"),
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe("OPEN");
  });

  it("enforces signup-day gate when enabled and outside the window", () => {
    const decision = canPublicApply({
      membershipYear,
      applicationWindow: { opensAt: null, closesAt: null },
      signupGate: {
        enforceSignupDayWindow: true,
        startsAt: "2026-02-07T12:00:00.000Z",
        endsAt: "2026-02-07T20:00:00.000Z",
      },
      activeEnrollments: 0,
      asOf: new Date("2026-02-08T10:00:00-05:00"),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("OUTSIDE_SIGNUP_DAY_GATE");
  });
});

