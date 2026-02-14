import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentYearInNewYork } from "@/lib/membership-dates";

function isAdmin(request: NextRequest): boolean {
  const user = getUserFromRequest(request);
  return user?.role === "ADMIN";
}

export async function GET(request: NextRequest) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const currentYearOnly = request.nextUrl.searchParams.get("currentYearOnly") !== "false";
  const currentYear = getCurrentYearInNewYork();

  const membershipYear = await prisma.membershipYear.findUnique({
    where: { year: currentYear },
    select: { id: true },
  });

  const payments = await prisma.payment.findMany({
    where:
      currentYearOnly && membershipYear
        ? { membershipYearId: membershipYear.id }
        : undefined,
    include: {
      member: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      membershipYear: {
        select: {
          year: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    payments,
    currentYearOnly,
  });
}
