import { prisma } from "@/lib/db";
import { emailService } from "@/lib/email";

export async function sendAndLog(options: {
  memberId: string | null;
  to: string;
  subject: string;
  html: string;
  text?: string;
  meta?: Record<string, unknown>;
}) {
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
      bodyPreview: options.text?.slice(0, 250) ?? options.html.slice(0, 250),
      sentAt: new Date(),
      meta: options.meta ?? undefined,
    },
  });

  return result;
}
