import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUserFromRequest = vi.fn();
const getCurrentYearInNewYork = vi.fn(() => 2026);
const countActiveEnrollments = vi.fn();
const determineRenewalTierForMember = vi.fn();
const isRenewalBlockedByLatePolicy = vi.fn();
const createCheckoutSession = vi.fn();

const memberFindUnique = vi.fn();
const membershipYearFindUnique = vi.fn();
const membershipApplicationFindUnique = vi.fn();
const membershipEnrollmentCount = vi.fn();
const membershipEnrollmentFindUnique = vi.fn();
const membershipEnrollmentUpsert = vi.fn();
const paymentCreate = vi.fn();

vi.mock("@/lib/auth", () => ({
  getUserFromRequest,
}));

vi.mock("@/lib/membership-dates", () => ({
  getCurrentYearInNewYork,
}));

vi.mock("@/services/membership", () => ({
  countActiveEnrollments,
  determineRenewalTierForMember,
  isRenewalBlockedByLatePolicy,
}));

vi.mock("@/services/payment", () => ({
  stripePaymentService: {
    createCheckoutSession,
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    member: {
      findUnique: memberFindUnique,
    },
    membershipYear: {
      findUnique: membershipYearFindUnique,
    },
    membershipApplication: {
      findUnique: membershipApplicationFindUnique,
    },
    membershipEnrollment: {
      count: membershipEnrollmentCount,
      findUnique: membershipEnrollmentFindUnique,
      upsert: membershipEnrollmentUpsert,
    },
    payment: {
      create: paymentCreate,
    },
  },
}));

describe("Stripe checkout route gating", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    getUserFromRequest.mockReturnValue({
      memberId: "member_1",
      email: "member@example.com",
      role: "MEMBER",
    });
    memberFindUnique.mockResolvedValue({
      id: "member_1",
      email: "member@example.com",
      isActive: true,
      isDisabledVeteran: false,
      isSenior: false,
      dob: null,
    });
    membershipYearFindUnique.mockResolvedValue({
      id: "year_1",
      year: 2026,
      membershipCap: 350,
      standardPriceCents: 15000,
      discountPriceCents: 10000,
      renewalDueAt: new Date("2026-01-31T23:59:59.999Z"),
    });
    membershipEnrollmentCount.mockResolvedValue(0);
    membershipEnrollmentFindUnique.mockResolvedValue(null);
    countActiveEnrollments.mockResolvedValue(0);
    isRenewalBlockedByLatePolicy.mockResolvedValue(false);
    determineRenewalTierForMember.mockResolvedValue({
      id: "tier_standard",
      code: "STANDARD",
      name: "Standard",
      amountCents: 15000,
    });
    createCheckoutSession.mockResolvedValue({
      sessionId: "cs_test_123",
      url: "https://stripe.test/checkout",
    });
    membershipEnrollmentUpsert.mockResolvedValue({ id: "enrollment_1" });
    paymentCreate.mockResolvedValue({ id: "payment_1" });
  });

  it("blocks checkout when application is submitted but not approved", async () => {
    membershipApplicationFindUnique.mockResolvedValue({
      id: "app_1",
      status: "SUBMITTED",
      denialReason: null,
      assignedPricingTier: {
        id: "tier_1",
        code: "STANDARD",
        name: "Standard",
        amountCents: 15000,
        isActive: true,
      },
    });

    const { POST } = await import("@/app/api/payments/stripe/checkout/route");
    const response = await POST(
      new NextRequest("http://localhost/api/payments/stripe/checkout", {
        method: "POST",
      })
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(409);
    expect(body.error).toContain("Awaiting admin approval");
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("blocks checkout when approved application has no assigned active tier", async () => {
    membershipApplicationFindUnique.mockResolvedValue({
      id: "app_1",
      status: "APPROVED",
      denialReason: null,
      assignedPricingTier: null,
    });

    const { POST } = await import("@/app/api/payments/stripe/checkout/route");
    const response = await POST(
      new NextRequest("http://localhost/api/payments/stripe/checkout", {
        method: "POST",
      })
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(409);
    expect(body.error).toContain("No active pricing tier");
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("allows checkout when application is approved and tier is assigned", async () => {
    membershipApplicationFindUnique.mockResolvedValue({
      id: "app_1",
      status: "APPROVED",
      denialReason: null,
      requestedDisabledVeteranDiscount: true,
      assignedPricingTier: {
        id: "tier_standard",
        code: "STANDARD",
        name: "Standard",
        amountCents: 15000,
        isActive: true,
      },
    });

    const { POST } = await import("@/app/api/payments/stripe/checkout/route");
    const response = await POST(
      new NextRequest("http://localhost/api/payments/stripe/checkout", {
        method: "POST",
      })
    );
    const body = (await response.json()) as { url?: string; error?: string };

    expect(response.status).toBe(200);
    expect(body.url).toBe("https://stripe.test/checkout");
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 15000,
        discountReason: "STANDARD",
      })
    );
  });

  it("keeps renewal checkout working when no new-member application exists", async () => {
    membershipApplicationFindUnique.mockResolvedValue(null);
    membershipEnrollmentCount.mockResolvedValue(1);
    determineRenewalTierForMember.mockResolvedValue({
      id: "tier_senior",
      code: "SENIOR",
      name: "Senior (65+)",
      amountCents: 10000,
    });

    const { POST } = await import("@/app/api/payments/stripe/checkout/route");
    const response = await POST(
      new NextRequest("http://localhost/api/payments/stripe/checkout", {
        method: "POST",
      })
    );
    const body = (await response.json()) as { url?: string; error?: string };

    expect(response.status).toBe(200);
    expect(body.url).toBe("https://stripe.test/checkout");
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 10000,
        discountReason: "SENIOR",
      })
    );
  });
});
