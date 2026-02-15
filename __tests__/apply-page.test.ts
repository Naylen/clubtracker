import { beforeEach, describe, expect, it, vi } from "vitest";

const membershipYearFindUnique = vi.fn();
const getCurrentUser = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NOT_FOUND");
});

vi.mock("@/lib/db", () => ({
  prisma: {
    membershipYear: {
      findUnique: membershipYearFindUnique,
    },
    systemSettings: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("@/lib/membership-dates", () => ({
  getCurrentYearInNewYork: () => 2026,
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser,
  requireCurrentUser: vi.fn(),
  createSessionToken: vi.fn(),
  setSessionCookie: vi.fn(),
}));

vi.mock("@/lib/password", () => ({
  hashPassword: vi.fn(() => "hashed"),
}));

vi.mock("next/navigation", () => ({
  notFound,
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

vi.mock("@/services/operations-state", () => ({
  getCurrentYearOperationalState: vi.fn().mockResolvedValue({
    dbReady: true,
    setupRequired: false,
    setupMessage: null,
    currentYear: 2026,
    applicationsOpen: false,
    renewalOpen: false,
    membershipCap: 350,
    year: 2026,
    membershipYear: null,
    applicationWindow: { opensAt: null, closesAt: null },
    applicationPublicOpen: false,
    activeEnrollments: 0,
    activeMembers: 0,
    pendingApplications: 0,
    unpaidRenewals: 0,
    capacityRemaining: 350,
    lateRenewalsEnabled: false,
    alerts: [],
  }),
}));

describe("/apply gating", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("is not reachable when applications are closed for the year", async () => {
    membershipYearFindUnique.mockResolvedValue({
      id: "year_1",
      year: 2026,
      applicationEnabled: false,
    });
    getCurrentUser.mockResolvedValue(null);

    const pageModule = await import("@/app/apply/page");
    await expect(pageModule.default({ searchParams: {} })).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
