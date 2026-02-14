import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptDlNumber, maskDlNumber } from "@/lib/dl-security";
import { createAuditLog } from "@/services/audit";

function requireAdmin(request: NextRequest) {
  const user = getUserFromRequest(request);
  return user?.role === "ADMIN" ? user : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminUser = requireAdmin(request);
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const member = await prisma.member.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      dlNumberCiphertext: true,
      dlNumberIv: true,
      dlNumberAuthTag: true,
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  if (!member.dlNumberCiphertext || !member.dlNumberIv || !member.dlNumberAuthTag) {
    return NextResponse.json({ error: "No driver license is stored for this member." }, { status: 404 });
  }

  let full = "";
  try {
    full = decryptDlNumber({
      dlNumberCiphertext: member.dlNumberCiphertext,
      dlNumberIv: member.dlNumberIv,
      dlNumberAuthTag: member.dlNumberAuthTag,
    });
  } catch {
    return NextResponse.json(
      { error: "Stored driver license could not be decrypted." },
      { status: 500 }
    );
  }

  await createAuditLog({
    action: "MEMBER_DL_REVEALED",
    actorMemberId: adminUser.memberId,
    targetMemberId: member.id,
    meta: {
      via: "api.admin.members.reveal-dl",
      revealedAt: new Date().toISOString(),
    },
  });

  return NextResponse.json({
    masked: maskDlNumber(full),
    full,
  });
}
