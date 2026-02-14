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

function isAdmin(request: NextRequest): boolean {
  const user = getUserFromRequest(request);
  return user?.role === "ADMIN";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isAdmin(request)) {
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
    isActive?: boolean;
  };

  const existing = await prisma.member.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const dob = Object.prototype.hasOwnProperty.call(body, "dob")
    ? parseDate(body.dob ?? null)
    : existing.dob;

  const member = await prisma.member.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.email !== undefined ? { email: body.email.trim().toLowerCase() } : {}),
      ...(body.phone !== undefined ? { phone: body.phone?.trim() || null } : {}),
      ...(body.address !== undefined ? { address: body.address?.trim() || null } : {}),
      ...(Object.prototype.hasOwnProperty.call(body, "dob") ? { dob } : {}),
      ...(body.isDisabledVeteran !== undefined
        ? { isDisabledVeteran: body.isDisabledVeteran }
        : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(Object.prototype.hasOwnProperty.call(body, "dob")
        ? { isSenior: isSeniorFromDob(dob) }
        : {}),
      ...(body.password ? { passwordHash: hashPassword(body.password) } : {}),
    },
  });

  return NextResponse.json({ member });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const member = await prisma.member.update({
    where: { id: params.id },
    data: { isActive: false },
  });

  return NextResponse.json({ member });
}
