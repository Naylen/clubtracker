import { beforeEach, describe, expect, it, vi } from "vitest";

const membershipYearFindUnique = vi.fn();
const ensureCurrentMembershipYear = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    membershipYear: {
      findUnique: membershipYearFindUnique,
    },
    systemSettings: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    member: {
      count: vi.fn().mockResolvedValue(0),
    },
    membershipApplication: {
      count: vi.fn().mockResolvedValue(0),
    },
    membershipEnrollment: {
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

vi.mock("@/lib/membership-dates", () => ({
  getCurrentYearInNewYork: () => 2026,
}));

vi.mock("@/services/bootstrap", () => ({
  ensureCurrentMembershipYear,
  isDatabaseNotInitializedError: (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code?: unknown }).code) === "P2021",
}));

vi.mock("@/services/membership", () => ({
  DEFAULT_MEMBERSHIP_CAP: 350,
  countActiveEnrollments: vi.fn().mockResolvedValue(0),
  getLateRenewalPolicy: vi.fn().mockResolvedValue({
    enabled: false,
    policyNotes: "",
  }),
}));

describe("operations state resilience", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    ensureCurrentMembershipYear.mockResolvedValue(undefined);
  });

  it("returns dbReady=false instead of throwing when MembershipYear table is missing", async () => {
    membershipYearFindUnique.mockRejectedValue({
      code: "P2021",
      message: 'The table "public.MembershipYear" does not exist.',
    });

    const { getCurrentYearOperationalState } = await import("@/services/operations-state");
    const state = await getCurrentYearOperationalState();

    expect(state.dbReady).toBe(false);
    expect(state.currentYear).toBe(2026);
    expect(state.applicationsOpen).toBe(false);
    expect(state.renewalOpen).toBe(false);
    expect(state.membershipCap).toBe(350);
    expect(state.alerts[0]).toContain("Database is not initialized");
  });
});
