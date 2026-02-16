import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateStructuredAddress } from "@/lib/address";
import { validateDisciplineInterests } from "@/lib/discipline";
import { secureDlNumber } from "@/lib/dl-security";
import { isSeniorFromDob } from "@/lib/membership-dates";
import { hashPassword } from "@/lib/password";
import { createAuditLog } from "@/services/audit";

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
  const adminUser = requireAdmin(request);
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name?: string;
    email?: string;
    password?: string;
    phone?: string | null;
    street1?: string | null;
    street2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    dob?: string | null;
    isDisabledVeteran?: boolean;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    emergencyContactRelationship?: string | null;
    disciplineInterests?: unknown;
    dlNumber?: string | null;
  };

  if (!body.name || !body.email || !body.password) {
    return NextResponse.json(
      { error: "name, email, and password are required" },
      { status: 400 }
    );
  }

  const dob = parseDate(body.dob ?? null);
  const disciplines = validateDisciplineInterests(body.disciplineInterests);
  if (disciplines.invalidValues.length > 0) {
    return NextResponse.json(
      {
        error: `Invalid discipline values: ${disciplines.invalidValues.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const dlNumberRaw = body.dlNumber?.trim();
  const secureDlFields = dlNumberRaw ? secureDlNumber(dlNumberRaw) : null;
  const parsedAddress = validateStructuredAddress({
    street1: body.street1,
    street2: body.street2,
    city: body.city,
    state: body.state,
    zip: body.zip,
  });
  if (parsedAddress.errors.length > 0) {
    return NextResponse.json({ error: parsedAddress.errors[0] }, { status: 400 });
  }

  const member = await prisma.member.create({
    data: {
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      passwordHash: hashPassword(body.password),
      phone: body.phone?.trim() || null,
      street1: parsedAddress.value.street1,
      street2: parsedAddress.value.street2,
      city: parsedAddress.value.city,
      state: parsedAddress.value.state,
      zip: parsedAddress.value.zip,
      dob,
      isDisabledVeteran: body.isDisabledVeteran === true,
      isSenior: isSeniorFromDob(dob),
      isActive: true,
      emergencyContactName: body.emergencyContactName?.trim() || null,
      emergencyContactPhone: body.emergencyContactPhone?.trim() || null,
      emergencyContactRelationship: body.emergencyContactRelationship?.trim() || null,
      disciplineInterests: disciplines.values,
      ...(secureDlFields ?? {}),
      role: "MEMBER",
    },
  });

  if (secureDlFields) {
    await createAuditLog({
      action: "MEMBER_DL_UPDATED",
      actorMemberId: adminUser.memberId,
      targetMemberId: member.id,
      meta: {
        via: "api.admin.members.create",
      },
    });
  }

  return NextResponse.json({ member }, { status: 201 });
}
