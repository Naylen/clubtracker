import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { ensureCurrentMembershipYear } from "@/services/bootstrap";
import {
  getOrCreateMembershipYearSettings,
  updateMembershipYearSettings,
} from "@/services/membership-year-settings";

function requireAdmin(request: NextRequest) {
  const user = getUserFromRequest(request);
  return user?.role === "ADMIN" ? user : null;
}

function parseYearParam(request: NextRequest): number | undefined {
  const raw = request.nextUrl.searchParams.get("year");
  if (!raw) {
    return undefined;
  }
  const year = Number(raw);
  if (!Number.isInteger(year)) {
    throw new Error("year must be an integer.");
  }
  return year;
}

export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await ensureCurrentMembershipYear();
    const year = parseYearParam(request);
    const membershipYear = await getOrCreateMembershipYearSettings(year);
    return NextResponse.json({ membershipYear });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch membership settings." },
      { status: 400 }
    );
  }
}

export async function PUT(request: NextRequest) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await ensureCurrentMembershipYear();
    const year = parseYearParam(request);
    if (!year) {
      return NextResponse.json({ error: "year query parameter is required." }, { status: 400 });
    }

    const body = (await request.json()) as {
      renewalOpensAt?: string;
      renewalDueAt?: string;
      membershipCap?: number;
      standardPriceCents?: number;
      discountPriceCents?: number;
      signupEnabled?: boolean;
      signupDate?: string | null;
      applicationEnabled?: boolean;
      applicationOpensAt?: string | null;
      applicationClosesAt?: string | null;
      enforceSignupDayWindow?: boolean;
      applicationSignupGateStartsAt?: string | null;
      applicationSignupGateEndsAt?: string | null;
      lateRenewalsEnabled?: boolean;
      lateRenewalPolicyNotes?: string;
    };

    const membershipYear = await updateMembershipYearSettings({
      year,
      data: body,
    });

    return NextResponse.json({ membershipYear });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update membership settings." },
      { status: 400 }
    );
  }
}
