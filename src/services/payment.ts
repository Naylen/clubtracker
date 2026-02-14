export interface CheckoutResult {
  url: string;
  sessionId: string;
}

export interface CheckoutSessionInput {
  memberId: string;
  membershipYearId: string;
  enrollmentId?: string;
  amountCents: number;
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
              name: "MCFGC Membership",
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        memberId: input.memberId,
        membershipYearId: input.membershipYearId,
        enrollmentId: input.enrollmentId,
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
