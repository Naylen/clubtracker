import type Stripe from "stripe";
import { prisma } from "@/lib/db";

type EventConstructor = (
  payload: string | Buffer,
  header: string,
  secret: string
) => Stripe.Event;

type WebhookPrisma = Pick<typeof prisma, "payment" | "membershipEnrollment" | "member" | "$transaction">;

export function verifyStripeEvent(input: {
  rawBody: string;
  signature: string | null;
  webhookSecret: string;
  constructEvent: EventConstructor;
}): Stripe.Event {
  if (!input.signature) {
    throw new Error("Missing Stripe signature header.");
  }

  try {
    return input.constructEvent(input.rawBody, input.signature, input.webhookSecret);
  } catch {
    throw new Error("Invalid Stripe signature.");
  }
}

async function handleCheckoutSessionCompleted(
  event: Stripe.Event,
  db: WebhookPrisma
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  const sessionId = session.id;

  if (!sessionId) {
    return;
  }

  const paymentBySession = await db.payment.findFirst({
    where: { externalId: sessionId },
    include: { enrollment: true },
    orderBy: { createdAt: "desc" },
  });

  const enrollmentIdFromMetadata =
    typeof session.metadata?.enrollmentId === "string" && session.metadata.enrollmentId
      ? session.metadata.enrollmentId
      : null;

  const payment =
    paymentBySession ??
    (enrollmentIdFromMetadata
      ? await db.payment.findFirst({
          where: { enrollmentId: enrollmentIdFromMetadata },
          include: { enrollment: true },
          orderBy: { createdAt: "desc" },
        })
      : null);

  if (!payment || payment.status === "SUCCEEDED") {
    return;
  }

  const paidAt = session.created ? new Date(session.created * 1000) : new Date();

  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCEEDED",
        paidAt,
        webhookEventId: event.id,
        externalId: sessionId,
      },
    });

    if (payment.enrollmentId) {
      await tx.membershipEnrollment.update({
        where: { id: payment.enrollmentId },
        data: {
          status: "ACTIVE",
          renewedAt: paidAt,
        },
      });
    }

    await tx.member.update({
      where: { id: payment.memberId },
      data: { isActive: true },
    });
  });
}

async function handlePaymentIntentFailed(
  event: Stripe.Event,
  db: WebhookPrisma
): Promise<void> {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const enrollmentId = paymentIntent.metadata?.enrollmentId;

  if (!enrollmentId) {
    return;
  }

  const payment = await db.payment.findFirst({
    where: {
      enrollmentId,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!payment || payment.status === "SUCCEEDED") {
    return;
  }

  await db.payment.update({
    where: { id: payment.id },
    data: {
      status: "FAILED",
      webhookEventId: event.id,
    },
  });
}

export async function processStripeEvent(
  event: Stripe.Event,
  db: WebhookPrisma = prisma
): Promise<void> {
  const alreadyProcessed = await db.payment.findUnique({
    where: { webhookEventId: event.id },
  });

  if (alreadyProcessed) {
    return;
  }

  if (event.type === "checkout.session.completed") {
    await handleCheckoutSessionCompleted(event, db);
    return;
  }

  if (event.type === "payment_intent.payment_failed") {
    await handlePaymentIntentFailed(event, db);
  }
}
