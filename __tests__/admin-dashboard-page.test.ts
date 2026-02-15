import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const requireAdmin = vi.fn();
const getCurrentYearOperationalState = vi.fn();
const pricingTierCount = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireAdmin,
}));

vi.mock("@/services/operations-state", () => ({
  getCurrentYearOperationalState,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    pricingTier: {
      count: pricingTierCount,
    },
    membershipYear: {
      update: vi.fn(),
    },
  },
}));

vi.mock("@/services/membership", () => ({
  createOrOpenCurrentYear: vi.fn(),
}));

describe("admin dashboard page", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    (globalThis as { React?: typeof React }).React = React;
    requireAdmin.mockResolvedValue({
      memberId: "admin_1",
      role: "ADMIN",
      email: "admin@example.com",
    });
    pricingTierCount.mockResolvedValue(3);
    getCurrentYearOperationalState.mockResolvedValue({
      year: 2026,
      membershipYear: {
        id: "year_1",
        year: 2026,
        membershipCap: 350,
        applicationEnabled: true,
        renewalOpensAt: new Date("2026-01-01T05:00:00.000Z"),
        renewalDueAt: new Date("2026-02-01T04:59:59.999Z"),
        signupDate: new Date("2026-02-07T17:00:00.000Z"),
      },
      applicationWindow: {
        opensAt: "2026-01-15T05:00:00.000Z",
        closesAt: "2026-03-01T05:00:00.000Z",
      },
      applicationPublicOpen: true,
      activeEnrollments: 120,
      activeMembers: 120,
      pendingApplications: 8,
      unpaidRenewals: 14,
      capacityRemaining: 230,
      lateRenewalsEnabled: false,
      alerts: [],
    });
  });

  it("renders control center with current-year state", async () => {
    const pageModule = await import("@/app/admin/page");
    const rendered = await pageModule.default();

    expect(rendered).toBeTruthy();
    expect(requireAdmin).toHaveBeenCalledWith("/admin");
    expect(getCurrentYearOperationalState).toHaveBeenCalledTimes(1);
    expect(pricingTierCount).toHaveBeenCalledTimes(1);
  });
});
