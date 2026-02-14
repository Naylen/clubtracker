import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserFromRequest = vi.fn();
const createAuditLog = vi.fn();
const findUnique = vi.fn();
const decryptDlNumber = vi.fn();
const maskDlNumber = vi.fn();

vi.mock("@/lib/auth", () => ({
  getUserFromRequest,
}));

vi.mock("@/services/audit", () => ({
  createAuditLog,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    member: {
      findUnique,
    },
  },
}));

vi.mock("@/lib/dl-security", () => ({
  decryptDlNumber,
  maskDlNumber,
}));

describe("Reveal DL route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("logs audit event when DL is revealed", async () => {
    getUserFromRequest.mockReturnValue({
      memberId: "admin_1",
      role: "ADMIN",
      email: "admin@example.com",
    });
    findUnique.mockResolvedValue({
      id: "member_123",
      dlNumberCiphertext: "cipher",
      dlNumberIv: "iv",
      dlNumberAuthTag: "tag",
    });
    decryptDlNumber.mockReturnValue("KY123456");
    maskDlNumber.mockReturnValue("****3456");

    const { POST } = await import("@/app/api/admin/members/[id]/reveal-dl/route");
    const request = new Request("http://localhost/api/admin/members/member_123/reveal-dl", {
      method: "POST",
    });

    const response = await POST(request as never, { params: { id: "member_123" } });
    const body = (await response.json()) as { full?: string; masked?: string };

    expect(response.status).toBe(200);
    expect(body.full).toBe("KY123456");
    expect(body.masked).toBe("****3456");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "MEMBER_DL_REVEALED",
        actorMemberId: "admin_1",
        targetMemberId: "member_123",
      })
    );
  });
});
