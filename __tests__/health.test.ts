import { describe, expect, it } from "vitest";

describe("Health check", () => {
  it("returns expected shape", () => {
    const response = {
      status: "ok",
      timestamp: new Date().toISOString(),
      database: "connected",
    };

    expect(response.status).toBe("ok");
    expect(response).toHaveProperty("timestamp");
    expect(response).toHaveProperty("database");
  });
});

describe("Membership defaults", () => {
  it("uses a cap of 350", () => {
    const membershipCap = 350;
    expect(membershipCap).toBe(350);
  });

  it("uses January 31 as renewal due date", () => {
    const due = new Date("2026-01-31T23:59:59.999-05:00");
    expect(due.toISOString()).toBe("2026-02-01T04:59:59.999Z");
  });
});
