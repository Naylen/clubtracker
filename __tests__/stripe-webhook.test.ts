import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { processStripeEvent, verifyStripeEvent } from "@/services/stripe-webhook";

describe("Stripe webhook verification", () => {
  it("rejects invalid signature", () => {
    expect(() =>
      verifyStripeEvent({
        rawBody: "{}",
        signature: "invalid-signature",
        webhookSecret: "whsec_test",
        constructEvent: () => {
          throw new Error("bad signature");
        },
      })
    ).toThrow("Invalid Stripe signature.");
  });
});

describe("Stripe webhook fulfillment", () => {
  it("updates Payment and Enrollment on checkout.session.completed", async () => {
    const paymentRecord = {
      id: "payment_1",
      memberId: "member_1",
      membershipYearId: "year_1",
      amountCents: 15000,
      status: "CREATED",
      enrollmentId: "enrollment_1",
    };

    const payment = {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(paymentRecord),
      update: vi.fn().mockResolvedValue(undefined),
    };

    const membershipEnrollment = {
      update: vi.fn().mockResolvedValue(undefined),
    };
    const member = {
      update: vi.fn().mockResolvedValue(undefined),
    };

    const tx = {
      payment,
      membershipEnrollment,
      member,
    };

    const db = {
      payment,
      membershipEnrollment,
      member,
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<void>) => {
        await callback(tx);
      }),
    };

    const event = {
      id: "evt_123",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          created: 1735689600,
          metadata: {
            enrollmentId: "enrollment_1",
          },
        },
      },
    } as unknown as Stripe.Event;

    await processStripeEvent(event, db as never);

    expect(payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "payment_1" },
        data: expect.objectContaining({
          status: "SUCCEEDED",
          webhookEventId: "evt_123",
          externalId: "cs_test_123",
        }),
      })
    );

    expect(membershipEnrollment.update).toHaveBeenCalledWith({
      where: { id: "enrollment_1" },
      data: expect.objectContaining({ status: "ACTIVE" }),
    });
    expect(member.update).toHaveBeenCalledWith({
      where: { id: "member_1" },
      data: { isActive: true },
    });
  });
});
