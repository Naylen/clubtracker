import { prisma } from "@/lib/db";
import { emailService } from "@/lib/email";
import { getCurrentYearInNewYork } from "@/lib/membership-dates";

export const MAX_BROADCAST_RECIPIENTS = 400;

export type BroadcastAudience = "CURRENT_YEAR_ACTIVE" | "ALL_ACTIVE_MEMBERS";

export type BroadcastRecipient = {
  memberId: string;
  email: string;
  name: string;
};

export type BroadcastRecipientRepository = {
  listCurrentYearActiveMembers: () => Promise<BroadcastRecipient[]>;
  listAllActiveMembers: () => Promise<BroadcastRecipient[]>;
};

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendAndLog(options: {
  memberId: string | null;
  to: string;
  subject: string;
  html: string;
  text?: string;
  meta?: Record<string, unknown>;
}) {
  const bodyPreview = options.text?.slice(0, 250) ?? options.html.slice(0, 250);

  try {
    const result = await emailService.send({
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    await prisma.communicationLog.create({
      data: {
        memberId: options.memberId,
        channel: "EMAIL",
        toAddress: options.to,
        subject: options.subject,
        bodyPreview,
        sentAt: new Date(),
        meta: {
          ...(options.meta ?? {}),
          deliveryStatus: "SENT",
          messageId: result.messageId,
        },
      },
    });

    return result;
  } catch (error) {
    await prisma.communicationLog.create({
      data: {
        memberId: options.memberId,
        channel: "EMAIL",
        toAddress: options.to,
        subject: options.subject,
        bodyPreview,
        sentAt: new Date(),
        meta: {
          ...(options.meta ?? {}),
          deliveryStatus: "FAILED",
          error: error instanceof Error ? error.message : "Unknown send error",
        },
      },
    });

    return { success: false };
  }
}

export async function resolveBroadcastRecipients(input: {
  audience: BroadcastAudience;
  maxRecipients?: number;
  repo: BroadcastRecipientRepository;
}): Promise<BroadcastRecipient[]> {
  const limit = input.maxRecipients ?? MAX_BROADCAST_RECIPIENTS;

  let recipients: BroadcastRecipient[];
  if (input.audience === "CURRENT_YEAR_ACTIVE") {
    recipients = await input.repo.listCurrentYearActiveMembers();

    // If current-year enrollment data is unavailable, fallback to all active members.
    if (recipients.length === 0) {
      recipients = await input.repo.listAllActiveMembers();
    }
  } else {
    recipients = await input.repo.listAllActiveMembers();
  }

  if (recipients.length > limit) {
    throw new Error(`Broadcast recipient limit exceeded (${limit}).`);
  }

  return recipients;
}

async function buildBroadcastRecipientRepository(): Promise<BroadcastRecipientRepository> {
  const currentYear = getCurrentYearInNewYork();
  const membershipYear = await prisma.membershipYear.findUnique({
    where: { year: currentYear },
    select: { id: true },
  });

  return {
    listCurrentYearActiveMembers: async () => {
      if (!membershipYear) {
        return [];
      }

      return prisma.member.findMany({
        where: {
          isActive: true,
          role: "MEMBER",
          enrollments: {
            some: {
              membershipYearId: membershipYear.id,
              status: "ACTIVE",
            },
          },
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
        orderBy: { createdAt: "asc" },
      }).then((rows) =>
        rows.map((row) => ({
          memberId: row.id,
          email: row.email,
          name: row.name,
        }))
      );
    },
    listAllActiveMembers: async () => {
      return prisma.member.findMany({
        where: {
          isActive: true,
          role: "MEMBER",
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
        orderBy: { createdAt: "asc" },
      }).then((rows) =>
        rows.map((row) => ({
          memberId: row.id,
          email: row.email,
          name: row.name,
        }))
      );
    },
  };
}

export async function sendBroadcastEmail(input: {
  subject: string;
  body: string;
  audience: BroadcastAudience;
  maxRecipients?: number;
}) {
  const repo = await buildBroadcastRecipientRepository();
  const recipients = await resolveBroadcastRecipients({
    audience: input.audience,
    maxRecipients: input.maxRecipients,
    repo,
  });

  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    const result = await sendAndLog({
      memberId: recipient.memberId,
      to: recipient.email,
      subject: input.subject,
      text: input.body,
      html: `<pre style=\"font-family:inherit;white-space:pre-wrap\">${htmlEscape(input.body)}</pre>`,
      meta: {
        audience: input.audience,
      },
    });

    if (result.success) {
      sentCount += 1;
    } else {
      failedCount += 1;
    }
  }

  return {
    recipients: recipients.length,
    sentCount,
    failedCount,
  };
}
