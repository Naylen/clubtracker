import { beforeEach, describe, expect, it, vi } from "vitest";

const memberFindUnique = vi.fn();
const memberFindFirst = vi.fn();
const memberCreate = vi.fn();
const memberUpdate = vi.fn();
const hashPassword = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    member: {
      findUnique: memberFindUnique,
      findFirst: memberFindFirst,
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
    hashPassword.mockReturnValue("hashed-next");
  });

  it("creates admin when no admin exists even with rotation disabled", async () => {
    memberFindUnique.mockResolvedValue(null);
    memberFindFirst.mockResolvedValue(null);
    memberCreate.mockResolvedValue({ id: "admin_1" });

    const { runAdminBootstrap } = await import("@/services/admin-bootstrap");
    const result = await runAdminBootstrap({
      env: {
        ADMIN_BOOTSTRAP: "false",
        ADMIN_EMAIL: "admin@mcfgc.local",
        ADMIN_PASSWORD: "temp_123!",
      },
    });

    expect(result).toEqual({ outcome: "created", email: "admin@mcfgc.local" });
    expect(memberCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "admin@mcfgc.local",
          role: "ADMIN",
          status: "ACTIVE",
          isActive: true,
          passwordHash: "hashed-next",
        }),
      })
    );
  });

  it("does not overwrite admin password unless rotation is enabled", async () => {
    memberFindUnique.mockResolvedValue(null);
    memberFindFirst.mockResolvedValue({
      id: "existing_admin",
      email: "existing@mcfgc.local",
      role: "ADMIN",
    });

    const { runAdminBootstrap } = await import("@/services/admin-bootstrap");
    const result = await runAdminBootstrap({
      env: {
        ADMIN_BOOTSTRAP: "false",
        ADMIN_EMAIL: "admin@mcfgc.local",
        ADMIN_PASSWORD: "temp_123!",
      },
    });

    expect(result.outcome).toBe("skipped");
    expect(memberCreate).not.toHaveBeenCalled();
    expect(memberUpdate).not.toHaveBeenCalled();
  });

  it("updates credentials when password rotation is enabled", async () => {
    memberFindUnique.mockResolvedValue({
      id: "admin_1",
      email: "admin@mcfgc.local",
      role: "ADMIN",
    });
    memberFindFirst.mockResolvedValue({
      id: "admin_1",
      email: "admin@mcfgc.local",
      role: "ADMIN",
    });
    memberUpdate.mockResolvedValue({ id: "admin_1" });

    const { runAdminBootstrap } = await import("@/services/admin-bootstrap");
    const result = await runAdminBootstrap({
      env: {
        ADMIN_ROTATE_PASSWORD: "true",
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
});
