import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUserFromRequest = vi.fn();
const createOrOpenMembershipYear = vi.fn();
const pricingTierFindMany = vi.fn();
const pricingTierCreate = vi.fn();
const pricingTierUpdate = vi.fn();

vi.mock("@/lib/auth", () => ({
  getUserFromRequest,
}));

vi.mock("@/services/membership", () => ({
  createOrOpenMembershipYear,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    pricingTier: {
      findMany: pricingTierFindMany,
      create: pricingTierCreate,
      update: pricingTierUpdate,
    },
  },
}));

describe("Admin pricing tier API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects non-admin access for collection routes", async () => {
    getUserFromRequest.mockReturnValue({
      memberId: "member_1",
      role: "MEMBER",
      email: "member@example.com",
    });

    const { GET, POST } = await import("@/app/api/admin/pricing-tiers/route");
    const getResponse = await GET(
      new NextRequest("http://localhost/api/admin/pricing-tiers?year=2026")
    );
    const postResponse = await POST(
      new NextRequest("http://localhost/api/admin/pricing-tiers?year=2026", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "STANDARD", name: "Standard", amountCents: 15000 }),
      })
    );

    expect(getResponse.status).toBe(403);
    expect(postResponse.status).toBe(403);
  });

  it("allows admin to list and create pricing tiers", async () => {
    getUserFromRequest.mockReturnValue({
      memberId: "admin_1",
      role: "ADMIN",
      email: "admin@example.com",
    });
    createOrOpenMembershipYear.mockResolvedValue({ id: "year_1", year: 2026 });
    pricingTierFindMany.mockResolvedValue([
      {
        id: "tier_1",
        code: "STANDARD",
        name: "Standard",
        amountCents: 15000,
        isActive: true,
        priority: 100,
      },
    ]);
    pricingTierCreate.mockResolvedValue({
      id: "tier_2",
      code: "JUNIOR",
      name: "Junior",
      amountCents: 12000,
      isActive: true,
      priority: 110,
    });

    const { GET, POST } = await import("@/app/api/admin/pricing-tiers/route");

    const getResponse = await GET(
      new NextRequest("http://localhost/api/admin/pricing-tiers?year=2026")
    );
    const getBody = (await getResponse.json()) as { pricingTiers?: Array<{ id: string }> };

    const postResponse = await POST(
      new NextRequest("http://localhost/api/admin/pricing-tiers?year=2026", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "junior",
          name: "Junior",
          amountCents: 12000,
          isActive: true,
          priority: 110,
        }),
      })
    );

    expect(getResponse.status).toBe(200);
    expect(getBody.pricingTiers?.[0]?.id).toBe("tier_1");
    expect(postResponse.status).toBe(201);
    expect(pricingTierCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          membershipYearId: "year_1",
          code: "JUNIOR",
          name: "Junior",
          amountCents: 12000,
        }),
      })
    );
  });

  it("rejects non-admin access for update route", async () => {
    getUserFromRequest.mockReturnValue({
      memberId: "member_1",
      role: "MEMBER",
      email: "member@example.com",
    });

    const { PUT } = await import("@/app/api/admin/pricing-tiers/[id]/route");
    const response = await PUT(
      new NextRequest("http://localhost/api/admin/pricing-tiers/tier_1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated", amountCents: 12345 }),
      }),
      { params: { id: "tier_1" } }
    );

    expect(response.status).toBe(403);
  });
});
