import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/db";

type BootstrapEnv = {
  ADMIN_BOOTSTRAP?: string;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
};

type BootstrapResult =
  | { outcome: "skipped"; reason: string }
  | { outcome: "created"; email: string }
  | { outcome: "updated"; email: string };

function isBootstrapEnabled(env: BootstrapEnv): boolean {
  return String(env.ADMIN_BOOTSTRAP ?? "false").toLowerCase() === "true";
}

export async function runAdminBootstrap(options?: {
  memberApi?: Pick<typeof prisma.member, "findUnique" | "create" | "update">;
  env?: BootstrapEnv;
}): Promise<BootstrapResult> {
  const env = options?.env ?? process.env;
  const memberApi = options?.memberApi ?? prisma.member;

  if (!isBootstrapEnabled(env)) {
    return { outcome: "skipped", reason: "ADMIN_BOOTSTRAP is not enabled." };
  }

  const email = String(env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = String(env.ADMIN_PASSWORD ?? "");

  if (!email || !password) {
    return {
      outcome: "skipped",
      reason: "ADMIN_EMAIL and ADMIN_PASSWORD are required when ADMIN_BOOTSTRAP=true.",
    };
  }

  const passwordHash = hashPassword(password);
  const existing = await memberApi.findUnique({ where: { email } });

  if (!existing) {
    await memberApi.create({
      data: {
        name: "MCFGC Admin",
        email,
        passwordHash,
        role: "ADMIN",
        status: "ACTIVE",
        isActive: true,
      },
    });
    return { outcome: "created", email };
  }

  await memberApi.update({
    where: { id: existing.id },
    data: {
      role: "ADMIN",
      status: "ACTIVE",
      isActive: true,
      passwordHash,
    },
  });
  return { outcome: "updated", email };
}
