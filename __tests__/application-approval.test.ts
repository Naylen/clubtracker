import { beforeEach, describe, expect, it, vi } from "vitest";

const membershipApplicationFindUnique = vi.fn();
const membershipApplicationUpdate = vi.fn();
const pricingTierFindUnique = vi.fn();
const memberFindUnique = vi.fn();
const auditLogCreate = vi.fn();

const tx = {
  membershipApplication: {
    findUnique: membershipApplicationFindUnique,
    update: membershipApplicationUpdate,
  },
  pricingTier: {
    findUnique: pricingTierFindUnique,
  },
  member: {
    findUnique: memberFindUnique,
  },
  auditLog: {
    create: auditLogCreate,
  },
};

const prisma = {
  $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
};

vi.mock("@/lib/db", () => ({
  prisma,
}));

describe("application approval", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    membershipApplicationFindUnique.mockResolvedValue({
      id: "app_1",
      membershipYearId: "year_1",
      membershipYear: {
        year: 2026,
        signupDate: new Date("2026-02-07T12:00:00-05:00"),
      },
      applicantDob: null,
      requestedDisabledVeteranDiscount: false,
      applicantEmail: "applicant@example.com",
      createdMemberId: "member_1",
    });
    pricingTierFindUnique.mockResolvedValue({
      id: "tier_standard",
      membershipYearId: "year_1",
      code: "STANDARD",
      isActive: true,
    });
    membershipApplicationUpdate.mockResolvedValue({
      id: "app_1",
      status: "APPROVED",
    });
    memberFindUnique.mockResolvedValue(null);
    auditLogCreate.mockResolvedValue({ id: "audit_1" });
  });

  it("does not throw FK errors when reviewer has no Member row", async () => {
    const { approveMembershipApplication } = await import("@/services/application-approval");

    await expect(
      approveMembershipApplication({
        applicationId: "app_1",
        reviewer: {
          memberId: "auth_admin_without_member_row",
          email: "admin@example.com",
        },
        assignedPricingTierId: "tier_standard",
        disabledVeteranApproved: false,
        confirmSeniorOverride: false,
      })
    ).resolves.toMatchObject({
      id: "app_1",
      status: "APPROVED",
    });

    expect(membershipApplicationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "app_1" },
        data: expect.objectContaining({
          status: "APPROVED",
          reviewedByMemberId: null,
          reviewedByEmail: "admin@example.com",
        }),
      })
    );

    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorMemberId: null,
          meta: expect.objectContaining({
            reviewedByEmail: "admin@example.com",
          }),
        }),
      })
    );
  });
});

