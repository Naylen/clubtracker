import { runAdminBootstrap } from "@/services/admin-bootstrap";

async function main() {
  const result = await runAdminBootstrap();

  if (result.outcome === "created") {
    console.log(`[admin:bootstrap] created admin user: ${result.email}`);
    return;
  }

  if (result.outcome === "updated") {
    console.log(`[admin:bootstrap] updated admin user: ${result.email}`);
    return;
  }

  console.log(`[admin:bootstrap] skipped: ${result.reason}`);
}

main()
  .catch((error) => {
    console.error("[admin:bootstrap] failed", error);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/db");
    await prisma.$disconnect();
  });
