import { beforeEach, describe, expect, it, vi } from "vitest";

const memberFindUnique = vi.fn();
const memberCreate = vi.fn();
const membershipEnrollmentCount = vi.fn();
const membershipApplicationUpsert = vi.fn();
const hashPassword = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    member: {
      findUnique: memberFindUnique,
      create: memberCreate,
      update: vi.fn(),
    },
    membershipEnrollment: {
      count: membershipEnrollmentCount,
    },
    membershipApplication: {
      upsert: membershipApplicationUpsert,
    },
    membershipYear: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/password", () => ({
  hashPassword,
}));

describe("application flow", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates a PENDING applicant account and SUBMITTED application", async () => {
    hashPassword.mockReturnValue("hashed-password");
    memberFindUnique.mockResolvedValue(null);
    memberCreate.mockResolvedValue({
      id: "member_1",
      email: "new@applicant.com",
      role: "MEMBER",
    });
    membershipApplicationUpsert.mockResolvedValue({
      id: "app_1",
      status: "SUBMITTED",
    });

    const { createApplicantAccountAndSubmit } = await import("@/services/application-flow");
    await createApplicantAccountAndSubmit({
      membershipYearId: "year_1",
      email: "new@applicant.com",
      password: "temp_123!",
      firstName: "New",
      lastName: "Applicant",
      phone: "555-1234",
      address: "123 Main",
      dob: new Date("1990-01-01T00:00:00.000Z"),
      requestedDisabledVeteranDiscount: false,
    });

    expect(memberCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "new@applicant.com",
          role: "MEMBER",
          status: "PENDING",
        }),
      })
    );
    expect(membershipApplicationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: "SUBMITTED",
          applicantEmail: "new@applicant.com",
        }),
      })
    );
  });
});
