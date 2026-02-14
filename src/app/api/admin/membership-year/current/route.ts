import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getCurrentYearInNewYork } from "@/lib/membership-dates";
import { prisma } from "@/lib/db";
import { createOrOpenCurrentYear } from "@/services/membership";

function isAdmin(request: NextRequest): boolean {
  const user = getUserFromRequest(request);
  return user?.role === "ADMIN";
}

export async function GET(request: NextRequest) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const year = getCurrentYearInNewYork();
  const membershipYear = await prisma.membershipYear.findUnique({ where: { year } });

  return NextResponse.json({ membershipYear });
}

export async function POST(request: NextRequest) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const membershipYear = await createOrOpenCurrentYear();
  return NextResponse.json({ membershipYear }, { status: 201 });
}
