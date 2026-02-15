import { beforeEach, describe, expect, it, vi } from "vitest";

const membershipYearFindUnique = vi.fn();
const createOrOpenMembershipYear = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    membershipYear: {
      findUnique: membershipYearFindUnique,
    },
  },
}));

vi.mock("@/lib/membership-dates", () => ({
  getCurrentYearInNewYork: () => 2026,
}));

vi.mock("@/services/membership", () => ({
  createOrOpenMembershipYear,
}));

describe("ensureCurrentMembershipYear", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates/open current membership year when missing", async () => {
    membershipYearFindUnique.mockResolvedValue(null);
    createOrOpenMembershipYear.mockResolvedValue({ id: "year_2026" });

    const { ensureCurrentMembershipYear } = await import("@/services/bootstrap");
    await ensureCurrentMembershipYear();

    expect(membershipYearFindUnique).toHaveBeenCalledWith({
      where: { year: 2026 },
      select: { id: true },
    });
    expect(createOrOpenMembershipYear).toHaveBeenCalledWith(2026);
  });

  it("is idempotent when current year already exists", async () => {
    membershipYearFindUnique.mockResolvedValue({ id: "year_2026" });

    const { ensureCurrentMembershipYear } = await import("@/services/bootstrap");
    await ensureCurrentMembershipYear();

    expect(createOrOpenMembershipYear).not.toHaveBeenCalled();
  });
});
