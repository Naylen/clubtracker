import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { processStripeEvent, verifyStripeEvent } from "@/services/stripe-webhook";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured." },
      { status: 500 }
    );
  }

  const rawBody = await request.text();

  let event;
  try {
    const stripe = getStripeClient();
    event = verifyStripeEvent({
      rawBody,
      signature,
      webhookSecret,
      constructEvent: stripe.webhooks.constructEvent.bind(stripe.webhooks),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to validate Stripe webhook.",
      },
      { status: 400 }
    );
  }

  try {
    await processStripeEvent(event);
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to process Stripe webhook event." },
      { status: 500 }
    );
  }
}
