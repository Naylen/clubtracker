import { calculateAgeOnDate, isSeniorOnDate } from "@/lib/membership-dates";

export function deriveApplicationReviewState(input: {
  applicantDob: Date | null;
  signupDay: Date;
  requestedDisabledVeteranDiscount: boolean;
}) {
  const ageOnSignupDay = input.applicantDob
    ? calculateAgeOnDate(input.applicantDob, input.signupDay)
    : null;
  const seniorAutoEligible = input.applicantDob
    ? isSeniorOnDate(input.applicantDob, input.signupDay)
    : false;

  const suggestedTierCode = seniorAutoEligible
    ? "SENIOR"
    : input.requestedDisabledVeteranDiscount
      ? "DISABLED_VETERAN"
      : "STANDARD";

  return {
    ageOnSignupDay,
    seniorAutoEligible,
    suggestedTierCode,
  };
}
