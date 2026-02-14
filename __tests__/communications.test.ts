import { describe, expect, it, vi } from "vitest";
import { resolveBroadcastRecipients } from "@/services/communication";

describe("Broadcast recipient selection", () => {
  it("falls back to all active members if current-year active list is empty", async () => {
    const repo = {
      listCurrentYearActiveMembers: vi.fn().mockResolvedValue([]),
      listAllActiveMembers: vi.fn().mockResolvedValue([
        { memberId: "m1", email: "one@example.com", name: "One" },
        { memberId: "m2", email: "two@example.com", name: "Two" },
      ]),
    };

    const recipients = await resolveBroadcastRecipients({
      audience: "CURRENT_YEAR_ACTIVE",
      maxRecipients: 400,
      repo,
    });

    expect(repo.listCurrentYearActiveMembers).toHaveBeenCalledTimes(1);
    expect(repo.listAllActiveMembers).toHaveBeenCalledTimes(1);
    expect(recipients).toHaveLength(2);
  });
});
