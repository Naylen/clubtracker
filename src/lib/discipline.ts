import type { MemberDiscipline } from "@prisma/client";

export const MEMBER_DISCIPLINE_OPTIONS: MemberDiscipline[] = [
  "ARCHERY",
  "PISTOL",
  "RIFLE",
  "TRAP",
];

const MEMBER_DISCIPLINE_SET = new Set<MemberDiscipline>(MEMBER_DISCIPLINE_OPTIONS);

export function parseDisciplineInterests(input: unknown): MemberDiscipline[] {
  const values = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? [input]
      : [];

  const parsed: MemberDiscipline[] = [];
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized = value.trim().toUpperCase() as MemberDiscipline;
    if (MEMBER_DISCIPLINE_SET.has(normalized)) {
      parsed.push(normalized);
    }
  }

  return Array.from(new Set(parsed));
}

export function validateDisciplineInterests(input: unknown): {
  values: MemberDiscipline[];
  invalidValues: string[];
} {
  const rawValues = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? [input]
      : [];

  const values = parseDisciplineInterests(rawValues);
  const normalizedValid = new Set(values);

  const invalidValues = rawValues
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0 && !normalizedValid.has(value as MemberDiscipline));

  return { values, invalidValues };
}
