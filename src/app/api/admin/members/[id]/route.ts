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

function getAdminUser(request: NextRequest) {
  const user = getUserFromRequest(request);
  return user?.role === "ADMIN" ? user : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminUser = getAdminUser(request);
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
    isActive?: boolean;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    emergencyContactRelationship?: string | null;
    disciplineInterests?: unknown;
    dlNumber?: string | null;
  };

  const existing = await prisma.member.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const dob = Object.prototype.hasOwnProperty.call(body, "dob")
    ? parseDate(body.dob ?? null)
    : existing.dob;
  const hasDisciplineInterests = Object.prototype.hasOwnProperty.call(
    body,
    "disciplineInterests"
  );
  const parsedDisciplines = hasDisciplineInterests
    ? validateDisciplineInterests(body.disciplineInterests)
    : null;

  if (parsedDisciplines && parsedDisciplines.invalidValues.length > 0) {
    return NextResponse.json(
      {
        error: `Invalid discipline values: ${parsedDisciplines.invalidValues.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const dlNumberRaw = body.dlNumber?.trim();
  const secureDlFields = dlNumberRaw ? secureDlNumber(dlNumberRaw) : null;
  const hasAddressPatch =
    body.street1 !== undefined ||
    body.street2 !== undefined ||
    body.city !== undefined ||
    body.state !== undefined ||
    body.zip !== undefined;

  const parsedAddress = hasAddressPatch
    ? validateStructuredAddress({
        street1: body.street1 ?? existing.street1,
        street2: body.street2 ?? existing.street2,
        city: body.city ?? existing.city,
        state: body.state ?? existing.state,
        zip: body.zip ?? existing.zip,
      })
    : null;

  if (parsedAddress && parsedAddress.errors.length > 0) {
    return NextResponse.json({ error: parsedAddress.errors[0] }, { status: 400 });
  }

  const member = await prisma.member.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.email !== undefined ? { email: body.email.trim().toLowerCase() } : {}),
      ...(body.phone !== undefined ? { phone: body.phone?.trim() || null } : {}),
      ...(parsedAddress
        ? {
            street1: parsedAddress.value.street1,
            street2: parsedAddress.value.street2,
            city: parsedAddress.value.city,
            state: parsedAddress.value.state,
            zip: parsedAddress.value.zip,
          }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(body, "dob") ? { dob } : {}),
      ...(body.isDisabledVeteran !== undefined
        ? { isDisabledVeteran: body.isDisabledVeteran }
        : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.emergencyContactName !== undefined
        ? { emergencyContactName: body.emergencyContactName?.trim() || null }
        : {}),
      ...(body.emergencyContactPhone !== undefined
        ? { emergencyContactPhone: body.emergencyContactPhone?.trim() || null }
        : {}),
      ...(body.emergencyContactRelationship !== undefined
        ? {
            emergencyContactRelationship:
              body.emergencyContactRelationship?.trim() || null,
          }
        : {}),
      ...(parsedDisciplines ? { disciplineInterests: parsedDisciplines.values } : {}),
      ...(Object.prototype.hasOwnProperty.call(body, "dob")
        ? { isSenior: isSeniorFromDob(dob) }
        : {}),
      ...(body.password ? { passwordHash: hashPassword(body.password) } : {}),
      ...(secureDlFields ?? {}),
    },
  });

  if (secureDlFields) {
    await createAuditLog({
      action: "MEMBER_DL_UPDATED",
      actorMemberId: adminUser.memberId,
      targetMemberId: member.id,
      meta: {
        via: "api.admin.members.update",
      },
    });
  }

  return NextResponse.json({ member });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!getAdminUser(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const member = await prisma.member.update({
    where: { id: params.id },
    data: { isActive: false },
  });

  return NextResponse.json({ member });
}
