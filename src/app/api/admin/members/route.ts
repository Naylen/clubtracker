import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isSeniorFromDob } from "@/lib/membership-dates";
import { hashPassword } from "@/lib/password";

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  return new Date(`${value}T00:00:00Z`);
}

function requireAdmin(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user || user.role !== "ADMIN") {
    return null;
  }
  return user;
}

export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const members = await prisma.member.findMany({
    where: { role: "MEMBER" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ members });
}

export async function POST(request: NextRequest) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name?: string;
    email?: string;
    password?: string;
    phone?: string | null;
    address?: string | null;
    dob?: string | null;
    isDisabledVeteran?: boolean;
  };

  if (!body.name || !body.email || !body.password) {
    return NextResponse.json(
      { error: "name, email, and password are required" },
      { status: 400 }
    );
  }

  const dob = parseDate(body.dob ?? null);

  const member = await prisma.member.create({
    data: {
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      passwordHash: hashPassword(body.password),
      phone: body.phone?.trim() || null,
      address: body.address?.trim() || null,
      dob,
      isDisabledVeteran: body.isDisabledVeteran === true,
      isSenior: isSeniorFromDob(dob),
      isActive: true,
      role: "MEMBER",
    },
  });

  return NextResponse.json({ member }, { status: 201 });
}
