import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createOrOpenMembershipYear } from "@/services/membership";

function requireAdmin(request: NextRequest) {
  const user = getUserFromRequest(request);
  return user?.role === "ADMIN" ? user : null;
}

function parseYear(request: NextRequest): number {
  const raw = request.nextUrl.searchParams.get("year");
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Valid year query parameter is required.");
  }
  return year;
}

function normalizeTierCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "_");
}

export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const year = parseYear(request);
    const membershipYear = await createOrOpenMembershipYear(year);
    const pricingTiers = await prisma.pricingTier.findMany({
      where: { membershipYearId: membershipYear.id },
      orderBy: [{ priority: "asc" }, { code: "asc" }],
    });

    return NextResponse.json({
      membershipYear: {
        id: membershipYear.id,
        year: membershipYear.year,
      },
      pricingTiers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load pricing tiers." },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const year = parseYear(request);
    const membershipYear = await createOrOpenMembershipYear(year);
    const body = (await request.json()) as {
      code?: string;
      name?: string;
      amountCents?: number;
      isActive?: boolean;
      priority?: number;
    };

    const code = normalizeTierCode(String(body.code ?? ""));
    const name = String(body.name ?? "").trim();
    const amountCents = Math.round(Number(body.amountCents));
    const priority = body.priority === undefined ? 100 : Math.round(Number(body.priority));
    const isActive = body.isActive !== false;

    if (!code || !name || !Number.isFinite(amountCents) || amountCents < 0) {
      return NextResponse.json(
        { error: "code, name, and a non-negative amountCents are required." },
        { status: 400 }
      );
    }

    const pricingTier = await prisma.pricingTier.create({
      data: {
        membershipYearId: membershipYear.id,
        code,
        name,
        amountCents,
        isActive,
        priority,
      },
    });

    return NextResponse.json({ pricingTier }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create pricing tier." },
      { status: 400 }
    );
  }
}
