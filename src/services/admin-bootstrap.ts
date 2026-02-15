import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/db";

type BootstrapEnv = {
  ADMIN_BOOTSTRAP?: string;
  ADMIN_ROTATE_PASSWORD?: string;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
};

type BootstrapResult =
  | { outcome: "skipped"; reason: string }
  | { outcome: "created"; email: string }
  | { outcome: "updated"; email: string };

function isLegacyBootstrapEnabled(env: BootstrapEnv | NodeJS.ProcessEnv): boolean {
  return String(env.ADMIN_BOOTSTRAP ?? "false").toLowerCase() === "true";
}

function isPasswordRotationEnabled(env: BootstrapEnv | NodeJS.ProcessEnv): boolean {
  const rotateFlag = String(env.ADMIN_ROTATE_PASSWORD ?? "false").toLowerCase() === "true";
  return rotateFlag || isLegacyBootstrapEnabled(env);
}

export async function runAdminBootstrap(options?: {
  memberApi?: Pick<typeof prisma.member, "findUnique" | "findFirst" | "create" | "update">;
  env?: BootstrapEnv;
}): Promise<BootstrapResult> {
  const env = options?.env ?? process.env;
  const memberApi = options?.memberApi ?? prisma.member;
  const rotatePassword = isPasswordRotationEnabled(env);

  const email = String(env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = String(env.ADMIN_PASSWORD ?? "");

  if (!email || !password) {
    return {
      outcome: "skipped",
      reason: "ADMIN_EMAIL and ADMIN_PASSWORD are required for admin bootstrap.",
    };
  }

  const [existingByEmail, anyAdmin] = await Promise.all([
    memberApi.findUnique({ where: { email } }),
    memberApi.findFirst({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const noAdminExists = !anyAdmin;

  if (!noAdminExists && !rotatePassword) {
    return {
      outcome: "skipped",
      reason:
        "Admin already exists. Set ADMIN_ROTATE_PASSWORD=true (or ADMIN_BOOTSTRAP=true) to rotate credentials.",
    };
  }

  const passwordHash = hashPassword(password);

  if (existingByEmail) {
    await memberApi.update({
      where: { id: existingByEmail.id },
      data: {
        role: "ADMIN",
        status: "ACTIVE",
        isActive: true,
        passwordHash,
      },
    });

    return { outcome: noAdminExists ? "created" : "updated", email };
  }

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

  return { outcome: noAdminExists ? "created" : "updated", email };
}
