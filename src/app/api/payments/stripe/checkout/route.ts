import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentYearInNewYork } from "@/lib/membership-dates";
import {
  getRenewalPriceForMember,
  isRenewalBlockedByLatePolicy,
} from "@/services/membership";
import { stripePaymentService } from "@/services/payment";

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (user.role !== "MEMBER") {
    return NextResponse.json(
      { error: "Only member accounts can start renewal checkout." },
      { status: 403 }
    );
  }

  const member = await prisma.member.findUnique({ where: { id: user.memberId } });
  if (!member || !member.isActive) {
    return NextResponse.json({ error: "Active member account not found." }, { status: 404 });
  }

  const currentYear = getCurrentYearInNewYork();
  const membershipYear = await prisma.membershipYear.findUnique({
    where: { year: currentYear },
  });

  if (!membershipYear) {
    return NextResponse.json(
      {
        error:
          "Membership year is not available yet. Ask an admin to create or open the current year.",
      },
      { status: 400 }
    );
  }

  const enrollment = await prisma.membershipEnrollment.upsert({
    where: {
      memberId_membershipYearId: {
        memberId: member.id,
        membershipYearId: membershipYear.id,
      },
    },
    update: {},
    create: {
      memberId: member.id,
      membershipYearId: membershipYear.id,
      status: "PENDING_RENEWAL",
    },
  });

  if (enrollment.status === "ACTIVE") {
    return NextResponse.json(
      {
        error:
          "Your renewal for the current year is already active. No payment session was created.",
      },
      { status: 409 }
    );
  }

  const lateRenewalBlocked = await isRenewalBlockedByLatePolicy({ membershipYear });
  if (lateRenewalBlocked) {
    return NextResponse.json(
      {
        error:
          "Renewal payments are closed after January 31 for this year. Contact an administrator if this should be overridden.",
      },
      { status: 409 }
    );
  }

  const pricing = getRenewalPriceForMember(member, membershipYear);
  const successUrl = `${request.nextUrl.origin}/pay/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${request.nextUrl.origin}/pay/cancel`;

  const checkout = await stripePaymentService.createCheckoutSession({
    memberId: member.id,
    membershipYearId: membershipYear.id,
    membershipYear: membershipYear.year,
    enrollmentId: enrollment.id,
    amountCents: pricing.amountCents,
    discountReason: pricing.discountReason,
    successUrl,
    cancelUrl,
  });

  if (!checkout.url) {
    return NextResponse.json(
      { error: "Could not create Stripe checkout session." },
      { status: 502 }
    );
  }

  // `externalId` stores the Stripe Checkout Session ID in the current schema.
  await prisma.payment.create({
    data: {
      provider: "STRIPE",
      amountCents: pricing.amountCents,
      status: "CREATED",
      externalId: checkout.sessionId,
      memberId: member.id,
      membershipYearId: membershipYear.id,
      enrollmentId: enrollment.id,
    },
  });

  return NextResponse.json({ url: checkout.url });
}
