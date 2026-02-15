import { beforeEach, describe, expect, it, vi } from "vitest";

const memberFindUnique = vi.fn();
const memberCreate = vi.fn();
const memberUpdate = vi.fn();
const hashPassword = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    member: {
      findUnique: memberFindUnique,
      create: memberCreate,
      update: memberUpdate,
    },
  },
}));

vi.mock("@/lib/password", () => ({
  hashPassword,
}));

describe("admin bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("updates existing admin password and role when ADMIN_BOOTSTRAP=true", async () => {
    hashPassword.mockReturnValue("hashed-next");
    memberFindUnique.mockResolvedValue({
      id: "admin_1",
      email: "admin@mcfgc.local",
      role: "MEMBER",
    });
    memberUpdate.mockResolvedValue({ id: "admin_1" });

    const { runAdminBootstrap } = await import("@/services/admin-bootstrap");
    const result = await runAdminBootstrap({
      env: {
        ADMIN_BOOTSTRAP: "true",
        ADMIN_EMAIL: "admin@mcfgc.local",
        ADMIN_PASSWORD: "new_password_123",
      },
    });

    expect(result).toEqual({ outcome: "updated", email: "admin@mcfgc.local" });
    expect(memberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "admin_1" },
        data: expect.objectContaining({
          role: "ADMIN",
          status: "ACTIVE",
          isActive: true,
          passwordHash: "hashed-next",
        }),
      })
    );
  });

  it("skips when ADMIN_BOOTSTRAP is false", async () => {
    const { runAdminBootstrap } = await import("@/services/admin-bootstrap");
    const result = await runAdminBootstrap({
      env: {
        ADMIN_BOOTSTRAP: "false",
        ADMIN_EMAIL: "admin@mcfgc.local",
        ADMIN_PASSWORD: "new_password_123",
      },
    });

    expect(result.outcome).toBe("skipped");
    expect(memberFindUnique).not.toHaveBeenCalled();
    expect(memberCreate).not.toHaveBeenCalled();
    expect(memberUpdate).not.toHaveBeenCalled();
  });
});
