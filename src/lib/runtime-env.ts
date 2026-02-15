import { existsSync, readFileSync } from "node:fs";

const loggedSetupIssues = new Set<string>();

type RuntimeEnvIssueCode =
  | "DATABASE_URL_MISSING"
  | "DATABASE_URL_INVALID"
  | "DATABASE_URL_LOCALHOST_IN_CONTAINER";

export type RuntimeEnvValidation = {
  setupRequired: boolean;
  code: RuntimeEnvIssueCode | "OK";
  message: string | null;
};

function parseDatabaseHost(databaseUrl: string): string | null {
  try {
    return new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isLocalhostHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function isRunningInContainer(): boolean {
  if (process.env.RUNNING_IN_DOCKER === "true") {
    return true;
  }

  if (existsSync("/.dockerenv")) {
    return true;
  }

  try {
    const cgroup = readFileSync("/proc/1/cgroup", "utf8");
    const normalized = cgroup.toLowerCase();
    return normalized.includes("docker") || normalized.includes("kubepods");
  } catch {
    return false;
  }
}

export function validateRuntimeEnvironment(
  env: NodeJS.ProcessEnv = process.env
): RuntimeEnvValidation {
  const strictMode = isRunningInContainer() || env.NODE_ENV === "production";
  if (!strictMode) {
    return { setupRequired: false, code: "OK", message: null };
  }

  const databaseUrl = String(env.DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    return {
      setupRequired: true,
      code: "DATABASE_URL_MISSING",
      message:
        "DATABASE_URL is missing. Set DATABASE_URL to the Postgres service host (db) and restart.",
    };
  }

  const host = parseDatabaseHost(databaseUrl);
  if (!host) {
    return {
      setupRequired: true,
      code: "DATABASE_URL_INVALID",
      message:
        "DATABASE_URL is invalid. Verify the connection string format and restart.",
    };
  }

  if (isLocalhostHost(host)) {
    return {
      setupRequired: true,
      code: "DATABASE_URL_LOCALHOST_IN_CONTAINER",
      message:
        "DATABASE_URL points to localhost. In containers, use host `db` (for example postgresql://...@db:5432/...).",
    };
  }

  return { setupRequired: false, code: "OK", message: null };
}

export function logSetupIssueOnce(key: string, message: string, error?: unknown): void {
  if (loggedSetupIssues.has(key)) {
    return;
  }
  loggedSetupIssues.add(key);

  if (error instanceof Error) {
    console.error(`[setup] ${message}`, { error: error.message });
    return;
  }

  if (error !== undefined) {
    console.error(`[setup] ${message}`, { error });
    return;
  }

  console.error(`[setup] ${message}`);
}

