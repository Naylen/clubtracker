import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUserFromRequest = vi.fn();
const getOrCreateMembershipYearSettings = vi.fn();
const updateMembershipYearSettings = vi.fn();

vi.mock("@/lib/auth", () => ({
  getUserFromRequest,
}));

vi.mock("@/services/membership-year-settings", () => ({
  getOrCreateMembershipYearSettings,
  updateMembershipYearSettings,
}));

describe("Membership settings admin API RBAC", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects MEMBER role for GET", async () => {
    getUserFromRequest.mockReturnValue({
      memberId: "member_1",
      role: "MEMBER",
      email: "member@example.com",
    });

    const { GET } = await import("@/app/api/admin/membership-year/route");
    const request = new NextRequest("http://localhost/api/admin/membership-year?year=2026");
    const response = await GET(request);

    expect(response.status).toBe(403);
  });

  it("rejects MEMBER role for PUT", async () => {
    getUserFromRequest.mockReturnValue({
      memberId: "member_1",
      role: "MEMBER",
      email: "member@example.com",
    });

    const { PUT } = await import("@/app/api/admin/membership-year/route");
    const request = new NextRequest("http://localhost/api/admin/membership-year?year=2026", {
      method: "PUT",
      body: JSON.stringify({ membershipCap: 350 }),
      headers: {
        "Content-Type": "application/json",
      },
    });
    const response = await PUT(request);

    expect(response.status).toBe(403);
  });

  it("allows ADMIN for GET", async () => {
    getUserFromRequest.mockReturnValue({
      memberId: "admin_1",
      role: "ADMIN",
      email: "admin@example.com",
    });
    getOrCreateMembershipYearSettings.mockResolvedValue({
      id: "year_1",
      year: 2026,
      startsAt: "2026-01-01T05:00:00.000Z",
      endsAt: "2027-01-01T04:59:59.999Z",
      renewalOpensAt: "2026-01-01T05:00:00.000Z",
      renewalDueAt: "2026-02-01T04:59:59.999Z",
      membershipCap: 350,
      standardPriceCents: 15000,
      discountPriceCents: 10000,
      signupEnabled: true,
      signupDate: "2026-02-01T14:00:00.000Z",
      applicationEnabled: false,
    });

    const { GET } = await import("@/app/api/admin/membership-year/route");
    const request = new NextRequest("http://localhost/api/admin/membership-year?year=2026");
    const response = await GET(request);
    const body = (await response.json()) as { membershipYear?: { year: number } };

    expect(response.status).toBe(200);
    expect(body.membershipYear?.year).toBe(2026);
    expect(getOrCreateMembershipYearSettings).toHaveBeenCalledWith(2026);
  });
});
