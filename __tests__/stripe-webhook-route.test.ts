import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(() => {
        throw new Error("invalid signature");
      }),
    },
  },
}));

describe("Stripe webhook route", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  it("rejects invalid signature", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");

    const request = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: {
        "stripe-signature": "bad-signature",
      },
      body: "{}",
    });

    const response = await POST(request as never);
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid Stripe signature.");
  });
});
