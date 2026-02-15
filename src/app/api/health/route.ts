import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateRuntimeEnvironment } from "@/lib/runtime-env";

export async function GET() {
  const checks: Record<string, string> = {
    status: "ok",
    timestamp: new Date().toISOString(),
  };

  const runtimeValidation = validateRuntimeEnvironment();
  if (runtimeValidation.setupRequired) {
    checks.status = "degraded";
    checks.runtime = runtimeValidation.message ?? "Runtime environment validation failed.";
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "connected";
  } catch {
    checks.database = "disconnected";
    checks.status = "degraded";
  }

  const statusCode = checks.status === "ok" ? 200 : 503;
  return NextResponse.json(checks, { status: statusCode });
}
