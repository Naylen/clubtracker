import { type PricingTier } from "@prisma/client";
import { calculateAgeOnDate } from "@/lib/membership-dates";

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

