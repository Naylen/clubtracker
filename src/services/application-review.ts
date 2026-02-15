import { type PricingTier } from "@prisma/client";
import {
  computeApplicantAgeOnSignupDay,
  determineRecommendedTier,
} from "@/services/application-policy";

export function deriveApplicationReviewState(input: {
  applicantDob: Date | null;
  signupDay: Date;
  requestedDisabledVeteranDiscount: boolean;
  availableTiers?: Array<Pick<PricingTier, "id" | "code" | "name" | "amountCents">>;
}) {
  const ageOnSignupDay = computeApplicantAgeOnSignupDay(
    input.applicantDob,
    input.signupDay
  );
  const recommendation = determineRecommendedTier({
    ageOnSignupDay,
    dvRequested: input.requestedDisabledVeteranDiscount,
    availableTiers: input.availableTiers ?? [],
  });

  return {
    ageOnSignupDay,
    seniorAutoEligible: recommendation.seniorEligible,
    suggestedTierCode: recommendation.suggestedTierCode,
  };
}
