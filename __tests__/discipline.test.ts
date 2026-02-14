import { describe, expect, it } from "vitest";
import { parseDisciplineInterests, validateDisciplineInterests } from "@/lib/discipline";

describe("Discipline parsing and validation", () => {
  it("accepts only supported enum values", () => {
    const values = parseDisciplineInterests(["archery", "PISTOL", "invalid", "rifle"]);
    expect(values).toEqual(["ARCHERY", "PISTOL", "RIFLE"]);
  });

  it("returns invalid discipline values", () => {
    const validated = validateDisciplineInterests(["ARCHERY", "TRAP", "BOWLING"]);
    expect(validated.values).toEqual(["ARCHERY", "TRAP"]);
    expect(validated.invalidValues).toEqual(["BOWLING"]);
  });
});
