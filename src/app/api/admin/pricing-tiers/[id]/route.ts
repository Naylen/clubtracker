import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

function requireAdmin(request: NextRequest) {
  const user = getUserFromRequest(request);
  return user?.role === "ADMIN" ? user : null;
}

function normalizeTierCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "_");
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      code?: string;
      name?: string;
      amountCents?: number;
      isActive?: boolean;
      priority?: number;
    };

    const updates: Record<string, unknown> = {};
    if (body.code !== undefined) {
      updates.code = normalizeTierCode(body.code);
    }
    if (body.name !== undefined) {
      updates.name = body.name.trim();
    }
    if (body.amountCents !== undefined) {
      const amount = Math.round(Number(body.amountCents));
      if (!Number.isFinite(amount) || amount < 0) {
        return NextResponse.json({ error: "amountCents must be non-negative." }, { status: 400 });
      }
      updates.amountCents = amount;
    }
    if (body.isActive !== undefined) {
      updates.isActive = Boolean(body.isActive);
    }
    if (body.priority !== undefined) {
      updates.priority = Math.round(Number(body.priority));
    }

    const pricingTier = await prisma.pricingTier.update({
      where: { id: params.id },
      data: updates,
    });

    return NextResponse.json({ pricingTier });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update pricing tier." },
      { status: 400 }
    );
  }
}
