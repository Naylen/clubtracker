import { spawnSync } from "node:child_process";

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("docker", ["compose", "down", "-v"]);
run("docker", ["compose", "up", "-d", "db"]);

console.log("[db:reset] database volume reset complete.");
console.log("[db:reset] next steps:");
console.log("  docker compose exec app npx prisma migrate deploy");
console.log("  docker compose exec app npx prisma db seed");

