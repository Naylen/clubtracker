export interface CheckoutResult {
  url: string;
  sessionId: string;
}

export interface CheckoutSessionInput {
  memberId: string;
  membershipYearId: string;
  membershipYear: number;
  enrollmentId?: string;
  amountCents: number;
  discountReason?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface PaymentService {
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutResult>;
}

export const stripePaymentService: PaymentService = {
  async createCheckoutSession(input) {
    const { stripe } = await import("@/lib/stripe");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: input.amountCents,
            product_data: {
              name: `MCFGC Membership Renewal ${input.membershipYear}`,
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        metadata: {
          memberId: input.memberId,
          membershipYearId: input.membershipYearId,
          membershipYear: String(input.membershipYear),
          enrollmentId: input.enrollmentId ?? "",
          priceCents: String(input.amountCents),
          discountReason: input.discountReason ?? "NONE",
        },
      },
      metadata: {
        memberId: input.memberId,
        membershipYearId: input.membershipYearId,
        membershipYear: String(input.membershipYear),
        enrollmentId: input.enrollmentId ?? "",
        priceCents: String(input.amountCents),
        discountReason: input.discountReason ?? "NONE",
      },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });

    return {
      url: session.url ?? "",
      sessionId: session.id,
    };
  },
};
