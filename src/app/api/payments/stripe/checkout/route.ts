import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentYearInNewYork } from "@/lib/membership-dates";
import {
  countActiveEnrollments,
  determineRenewalTierForMember,
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

  const application = await prisma.membershipApplication.findUnique({
    where: {
      membershipYearId_applicantEmail: {
        membershipYearId: membershipYear.id,
        applicantEmail: member.email,
      },
    },
    include: {
      assignedPricingTier: true,
    },
  });

  const hasMembershipHistory =
    (await prisma.membershipEnrollment.count({
      where: {
        memberId: member.id,
        status: "ACTIVE",
      },
    })) > 0;

  const existingEnrollment = await prisma.membershipEnrollment.findUnique({
    where: {
      memberId_membershipYearId: {
        memberId: member.id,
        membershipYearId: membershipYear.id,
      },
    },
  });

  if (existingEnrollment?.status === "ACTIVE") {
    return NextResponse.json(
      {
        error:
          "Your renewal for the current year is already active. No payment session was created.",
      },
      { status: 409 }
    );
  }

  let selectedTier:
    | {
        code: string;
        name: string;
        amountCents: number;
      }
    | null = null;
  let isRenewalCheckout = false;

  if (application) {
    if (application.status !== "APPROVED") {
      const statusMessages: Record<string, string> = {
        DRAFT: "Your application is still in draft. Submit it for review first.",
        SUBMITTED: "Awaiting admin approval before payment is available.",
        DENIED: application.denialReason
          ? `Application denied: ${application.denialReason}`
          : "Application denied. Contact an administrator for details.",
      };
      return NextResponse.json(
        {
          error: statusMessages[application.status] ?? "Application is not approved yet.",
        },
        { status: 409 }
      );
    }

    if (!application.assignedPricingTier || !application.assignedPricingTier.isActive) {
      return NextResponse.json(
        { error: "No active pricing tier is assigned to this application." },
        { status: 409 }
      );
    }

    selectedTier = {
      code: application.assignedPricingTier.code,
      name: application.assignedPricingTier.name,
      amountCents: application.assignedPricingTier.amountCents,
    };
  } else if (hasMembershipHistory || existingEnrollment) {
    const renewalTier = await determineRenewalTierForMember({
      member,
      membershipYear,
    });
    if (!renewalTier) {
      return NextResponse.json(
        { error: "No active pricing tier is available for renewals this year." },
        { status: 409 }
      );
    }
    selectedTier = renewalTier;
    isRenewalCheckout = true;
  } else {
    return NextResponse.json(
      { error: "No application found. Submit an application before payment." },
      { status: 409 }
    );
  }

  if (!selectedTier) {
    return NextResponse.json(
      { error: "Pricing tier could not be determined for checkout." },
      { status: 409 }
    );
  }

  const activeEnrollments = await countActiveEnrollments(membershipYear.id);
  if (activeEnrollments >= membershipYear.membershipCap) {
    return NextResponse.json(
      {
        error: "Membership capacity for this year is full.",
      },
      { status: 409 }
    );
  }

  const lateRenewalBlocked = isRenewalCheckout
    ? await isRenewalBlockedByLatePolicy({ membershipYear })
    : false;
  if (lateRenewalBlocked) {
    return NextResponse.json(
      {
        error:
          "Renewal payments are closed after January 31 for this year. Contact an administrator if this should be overridden.",
      },
      { status: 409 }
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

  const successUrl = `${request.nextUrl.origin}/pay/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${request.nextUrl.origin}/pay/cancel`;

  const checkout = await stripePaymentService.createCheckoutSession({
    memberId: member.id,
    membershipYearId: membershipYear.id,
    membershipYear: membershipYear.year,
    enrollmentId: enrollment.id,
    amountCents: selectedTier.amountCents,
    discountReason: selectedTier.code,
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
      amountCents: selectedTier.amountCents,
      status: "CREATED",
      externalId: checkout.sessionId,
      memberId: member.id,
      membershipYearId: membershipYear.id,
      enrollmentId: enrollment.id,
    },
  });

  return NextResponse.json({ url: checkout.url });
}
