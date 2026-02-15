import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUserFromRequest = vi.fn();
const memberFindUnique = vi.fn();
const memberCreate = vi.fn();
const memberUpdate = vi.fn();
const membershipEnrollmentFindUnique = vi.fn();
const membershipEnrollmentCreate = vi.fn();
const communicationLogCreate = vi.fn();
const createOrOpenCurrentYear = vi.fn();
const hashPassword = vi.fn(() => "hashed-password");

vi.mock("@/lib/auth", () => ({
  getUserFromRequest,
}));

vi.mock("@/lib/password", () => ({
  hashPassword,
}));

vi.mock("@/services/membership", () => ({
  createOrOpenCurrentYear,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    member: {
      findUnique: memberFindUnique,
      create: memberCreate,
      update: memberUpdate,
    },
    membershipEnrollment: {
      findUnique: membershipEnrollmentFindUnique,
      create: membershipEnrollmentCreate,
    },
    communicationLog: {
      create: communicationLogCreate,
    },
  },
}));

describe("member import route communication logging", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    getUserFromRequest.mockReturnValue({
      memberId: "admin_1",
      email: "admin@example.com",
      role: "ADMIN",
    });
    memberFindUnique.mockResolvedValue(null);
    memberCreate.mockResolvedValue({ id: "member_1" });
    memberUpdate.mockResolvedValue({ id: "member_1" });
    membershipEnrollmentFindUnique.mockResolvedValue(null);
    membershipEnrollmentCreate.mockResolvedValue({ id: "enrollment_1" });
    communicationLogCreate.mockResolvedValue({ id: "comm_1" });
    createOrOpenCurrentYear.mockResolvedValue({ id: "year_2026", year: 2026 });
  });

  it("writes CSV import audit log with null memberId to avoid FK failures", async () => {
    const csv = "email,name\nnew.member@example.com,New Member";
    const form = new FormData();
    form.append("mode", "import");
    form.append("file", new File([csv], "members.csv", { type: "text/csv" }));

    const { POST } = await import("@/app/api/admin/members/import/route");
    const request = new NextRequest("http://localhost/api/admin/members/import", {
      method: "POST",
      body: form,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(communicationLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          memberId: null,
          subject: "MEMBERS_CSV_IMPORT",
        }),
      })
    );
  });
});
