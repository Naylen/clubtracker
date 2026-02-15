import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentYearInNewYork } from "@/lib/membership-dates";
import { createOrOpenMembershipYear } from "@/services/membership";

function messageIndicatesMissingSchema(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("relation") ||
    normalized.includes("no such table") ||
    normalized.includes("migration")
  );
}

export function isDatabaseNotInitializedError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2021" || error.code === "P2022";
  }

  if (typeof error === "object" && error !== null) {
    const maybeCode = "code" in error ? String((error as { code?: unknown }).code) : "";
    const maybeMessage =
      "message" in error ? String((error as { message?: unknown }).message ?? "") : "";

    if (maybeCode === "P2021" || maybeCode === "P2022") {
      return true;
    }

    if (maybeMessage && messageIndicatesMissingSchema(maybeMessage)) {
      return true;
    }
  }

  return false;
}

export async function ensureCurrentMembershipYear(): Promise<void> {
  const year = getCurrentYearInNewYork();

  const existing = await prisma.membershipYear.findUnique({
    where: { year },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  await createOrOpenMembershipYear(year);
}
