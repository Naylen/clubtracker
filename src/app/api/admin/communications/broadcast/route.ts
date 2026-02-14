import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import {
  type BroadcastAudience,
  MAX_BROADCAST_RECIPIENTS,
  sendBroadcastEmail,
} from "@/services/communication";

function isAdmin(request: NextRequest): boolean {
  const user = getUserFromRequest(request);
  return user?.role === "ADMIN";
}

function parseAudience(value: string): BroadcastAudience {
  return value === "ALL_ACTIVE_MEMBERS" ? "ALL_ACTIVE_MEMBERS" : "CURRENT_YEAR_ACTIVE";
}

export async function POST(request: NextRequest) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    subject?: string;
    body?: string;
    audience?: string;
  };

  const subject = body.subject?.trim() ?? "";
  const messageBody = body.body?.trim() ?? "";
  const audience = parseAudience(body.audience ?? "CURRENT_YEAR_ACTIVE");

  if (!subject || !messageBody) {
    return NextResponse.json(
      { error: "subject and body are required" },
      { status: 400 }
    );
  }

  try {
    const result = await sendBroadcastEmail({
      subject,
      body: messageBody,
      audience,
      maxRecipients: MAX_BROADCAST_RECIPIENTS,
    });

    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Broadcast failed",
      },
      { status: 400 }
    );
  }
}
