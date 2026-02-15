import { describe, expect, it } from "vitest";
import { validateRuntimeEnvironment } from "@/lib/runtime-env";

describe("runtime environment validation", () => {
  it("marks localhost DATABASE_URL as setup-required in strict mode", () => {
    const result = validateRuntimeEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/clubtracker?schema=public",
    });

    expect(result.setupRequired).toBe(true);
    expect(result.code).toBe("DATABASE_URL_LOCALHOST_IN_CONTAINER");
  });

  it("accepts a non-localhost DATABASE_URL in strict mode", () => {
    const result = validateRuntimeEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@db:5432/clubtracker?schema=public",
    });

    expect(result.setupRequired).toBe(false);
    expect(result.code).toBe("OK");
  });
});

