import { describe, expect, it } from "vitest";
import { deriveApplicationReviewState } from "@/services/application-review";

describe("application review tier and senior badge logic", () => {
  it("defaults to SENIOR tier and senior auto badge when age is 65+ on signup day", () => {
    const state = deriveApplicationReviewState({
      applicantDob: new Date("1961-02-07T00:00:00.000Z"),
      signupDay: new Date("2026-02-07T12:00:00-05:00"),
      requestedDisabledVeteranDiscount: false,
    });

    expect(state.ageOnSignupDay).toBe(65);
    expect(state.seniorAutoEligible).toBe(true);
    expect(state.suggestedTierCode).toBe("SENIOR");
  });

  it("uses DISABLED_VETERAN suggested tier when not senior and discount requested", () => {
    const state = deriveApplicationReviewState({
      applicantDob: new Date("1990-05-01T00:00:00.000Z"),
      signupDay: new Date("2026-02-07T12:00:00-05:00"),
      requestedDisabledVeteranDiscount: true,
    });

    expect(state.seniorAutoEligible).toBe(false);
    expect(state.suggestedTierCode).toBe("DISABLED_VETERAN");
  });
});
