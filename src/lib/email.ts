import nodemailer from "nodemailer";

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
}

export interface EmailService {
  send(options: EmailOptions): Promise<EmailResult>;
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export const emailService: EmailService = {
  async send(options: EmailOptions): Promise<EmailResult> {
    const transport = createTransport();
    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM || "MCFGC <noreply@mcfgcinc.com>",
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    return { success: true, messageId: info.messageId };
  },
};
