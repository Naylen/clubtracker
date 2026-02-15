import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

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

const nextDir = resolve(process.cwd(), ".next");
rmSync(nextDir, { recursive: true, force: true });
console.log(`[docker:reset] removed ${nextDir}`);
