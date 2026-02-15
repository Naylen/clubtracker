import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/password";

const memberFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    member: {
      findUnique: memberFindUnique,
    },
  },
}));

describe("authenticate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("allows active admin credentials", async () => {
    memberFindUnique.mockResolvedValue({
      id: "admin_1",
      email: "admin@mcfgc.local",
      role: "ADMIN",
      isActive: true,
      status: "ACTIVE",
      passwordHash: hashPassword("temp_123!"),
    });

    const { authenticate } = await import("@/lib/auth");
    const user = await authenticate("admin@mcfgc.local", "temp_123!");

    expect(user).toEqual(
      expect.objectContaining({
        memberId: "admin_1",
        email: "admin@mcfgc.local",
        role: "ADMIN",
      })
    );
  });

  it("rejects INACTIVE status even with a correct password", async () => {
    memberFindUnique.mockResolvedValue({
      id: "member_1",
      email: "member@example.com",
      role: "MEMBER",
      isActive: true,
      status: "INACTIVE",
      passwordHash: hashPassword("temp_123!"),
    });

    const { authenticate } = await import("@/lib/auth");
    const user = await authenticate("member@example.com", "temp_123!");

    expect(user).toBeNull();
  });
});
