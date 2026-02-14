import { randomBytes } from "crypto";
import type { EnrollmentStatus, Role } from "@prisma/client";
import { isSeniorFromDob } from "@/lib/membership-dates";
import { hashPassword } from "@/lib/password";

export const IMPORT_PREVIEW_LIMIT = 50;

export type MemberImportOptions = {
  upsertByEmail: boolean;
  createEnrollmentForCurrentYear: boolean;
  markImportedMembersActive: boolean;
};

export const DEFAULT_MEMBER_IMPORT_OPTIONS: MemberImportOptions = {
  upsertByEmail: true,
  createEnrollmentForCurrentYear: false,
  markImportedMembersActive: true,
};

export type ImportRowError = {
  rowNumber: number;
  messages: string[];
};

export type PreparedMemberImportRow = {
  rowNumber: number;
  raw: Record<string, string>;
  email: string | null;
  name: string | null;
  phone: string | null;
  address: string | null;
  dob: Date | null;
  isDisabledVeteran: boolean;
  isActive: boolean;
  errors: string[];
};

export type PreparedMemberImport = {
  headers: string[];
  rows: PreparedMemberImportRow[];
  errors: ImportRowError[];
};

export type MemberImportExecutionResult = {
  totals: {
    rows: number;
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  errors: ImportRowError[];
};

type ParsedStatus = "ACTIVE" | "INACTIVE" | "PENDING";

type MemberForImportUpdate = {
  name: string;
  phone: string | null;
  address: string | null;
  dob: Date | null;
  isDisabledVeteran: boolean;
  isSenior: boolean;
  isActive: boolean;
};

export type MemberImportRepository = {
  findMemberByEmail: (email: string) => Promise<{ id: string } | null>;
  createMember: (input: {
    name: string;
    email: string;
    passwordHash: string;
    phone: string | null;
    address: string | null;
    dob: Date | null;
    isDisabledVeteran: boolean;
    isSenior: boolean;
    isActive: boolean;
    role: Role;
  }) => Promise<{ id: string }>;
  updateMember: (
    memberId: string,
    input: MemberForImportUpdate
  ) => Promise<{ id: string }>;
  ensureCurrentMembershipYear: () => Promise<{ id: string; year: number }>;
  findEnrollment: (
    memberId: string,
    membershipYearId: string
  ) => Promise<{ id: string } | null>;
  createEnrollment: (input: {
    memberId: string;
    membershipYearId: string;
    status: EnrollmentStatus;
  }) => Promise<{ id: string }>;
  createImportAuditLog: (input: {
    actorMemberId: string;
    actorEmail: string;
    filename: string;
    options: MemberImportOptions;
    totals: MemberImportExecutionResult["totals"];
    rowErrors: ImportRowError[];
  }) => Promise<void>;
};

type CsvParseOutput = {
  headers: string[];
  records: Record<string, string>[];
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATUS_VALUES = new Set(["ACTIVE", "INACTIVE", "PENDING"]);
const TRUTHY_VALUES = new Set(["true", "yes", "y", "1"]);
const FALSY_VALUES = new Set(["false", "no", "n", "0"]);

const HEADER_ALIASES: Record<string, string[]> = {
  email: ["email", "emailaddress", "e-mail", "e_mail"],
  firstName: ["firstname", "first_name", "first", "fname", "givenname"],
  lastName: ["lastname", "last_name", "last", "lname", "surname", "familyname"],
  name: ["name", "fullname", "full_name", "membername"],
  phone: ["phone", "phonenumber", "phone_number", "mobile", "telephone"],
  address: ["address", "address1", "street", "streetaddress"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  zip: ["zip", "zipcode", "zip_code", "postalcode", "postal_code"],
  dateOfBirth: ["dateofbirth", "dob", "birthdate", "birth_date"],
  isDisabledVeteran: [
    "isdisabledveteran",
    "disabledveteran",
    "disabled_veteran",
    "veteran",
  ],
  status: ["status", "memberstatus", "member_status"],
  role: ["role", "userrole", "user_role"],
};

export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCsvText(csvText: string): CsvParseOutput {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n" || char === "\r") {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  row.push(field);
  rows.push(row);

  const nonEmptyRows = rows.filter((columns) =>
    columns.some((value) => value.trim().length > 0)
  );

  if (nonEmptyRows.length === 0) {
    return { headers: [], records: [] };
  }

  const headers = nonEmptyRows[0].map((header) => header.replace(/^\uFEFF/, "").trim());
  const records = nonEmptyRows.slice(1).map((columns) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (columns[index] ?? "").trim();
    });
    return record;
  });

  return { headers, records };
}

function getAliasedValue(
  row: Record<string, string>,
  canonicalName: keyof typeof HEADER_ALIASES
): string {
  const normalizedToRaw = new Map<string, string>();
  Object.keys(row).forEach((key) => {
    normalizedToRaw.set(normalizeHeader(key), key);
  });

  for (const alias of HEADER_ALIASES[canonicalName]) {
    const key = normalizedToRaw.get(normalizeHeader(alias));
    if (key) {
      return row[key]?.trim() ?? "";
    }
  }

  return "";
}

function parseDateOfBirth(value: string): { value: Date | null; error?: string } {
  if (!value) {
    return { value: null };
  }

  const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (isoPattern.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      return { value: date };
    }
  }

  const slashPattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const slashMatch = value.match(slashPattern);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      !Number.isNaN(date.getTime()) &&
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return { value: date };
    }
  }

  return {
    value: null,
    error: "dateOfBirth must be YYYY-MM-DD or MM/DD/YYYY",
  };
}

function parseBoolean(value: string): { value: boolean | null; error?: string } {
  if (!value) {
    return { value: null };
  }

  const normalized = value.toLowerCase();
  if (TRUTHY_VALUES.has(normalized)) {
    return { value: true };
  }
  if (FALSY_VALUES.has(normalized)) {
    return { value: false };
  }

  return {
    value: null,
    error: "isDisabledVeteran must be true/false/yes/no/1/0",
  };
}

function parseStatus(value: string): { value: ParsedStatus | null; error?: string } {
  if (!value) {
    return { value: null };
  }

  const normalized = value.trim().toUpperCase();
  if (STATUS_VALUES.has(normalized)) {
    return { value: normalized as ParsedStatus };
  }

  return {
    value: null,
    error: "status must be ACTIVE, INACTIVE, or PENDING",
  };
}

function combineName(firstName: string, lastName: string, fullName: string): string {
  if (fullName) {
    return fullName;
  }

  const combined = [firstName, lastName].filter(Boolean).join(" ").trim();
  return combined;
}

function combineAddress(address: string, city: string, state: string, zip: string): string | null {
  const cityStateZip = [city, state, zip].filter(Boolean).join(" ").trim();
  if (address && cityStateZip) {
    return `${address}, ${cityStateZip}`;
  }
  if (address) {
    return address;
  }
  if (cityStateZip) {
    return cityStateZip;
  }
  return null;
}

function resolveIsActive(
  status: ParsedStatus | null,
  options: MemberImportOptions
): boolean {
  if (options.markImportedMembersActive) {
    return true;
  }
  if (!status) {
    return true;
  }
  return status === "ACTIVE";
}

export function prepareMemberCsvImport(
  csvText: string,
  options: MemberImportOptions = DEFAULT_MEMBER_IMPORT_OPTIONS
): PreparedMemberImport {
  const parsed = parseCsvText(csvText);
  const rows: PreparedMemberImportRow[] = [];
  const errors: ImportRowError[] = [];

  parsed.records.forEach((row, index) => {
    const rowNumber = index + 2;
    const rowErrors: string[] = [];

    const emailRaw = getAliasedValue(row, "email").toLowerCase();
    const firstName = getAliasedValue(row, "firstName");
    const lastName = getAliasedValue(row, "lastName");
    const fullName = getAliasedValue(row, "name");
    const phone = getAliasedValue(row, "phone") || null;
    const address = getAliasedValue(row, "address");
    const city = getAliasedValue(row, "city");
    const state = getAliasedValue(row, "state");
    const zip = getAliasedValue(row, "zip");
    const dobRaw = getAliasedValue(row, "dateOfBirth");
    const veteranRaw = getAliasedValue(row, "isDisabledVeteran");
    const statusRaw = getAliasedValue(row, "status");
    const roleRaw = getAliasedValue(row, "role").toUpperCase();

    if (!emailRaw) {
      rowErrors.push("email is required");
    } else if (!EMAIL_PATTERN.test(emailRaw)) {
      rowErrors.push("email format is invalid");
    }

    const name = combineName(firstName, lastName, fullName);
    if (!name) {
      rowErrors.push("name is required (name or firstName/lastName)");
    }

    const dobParsed = parseDateOfBirth(dobRaw);
    if (dobParsed.error) {
      rowErrors.push(dobParsed.error);
    }

    const veteranParsed = parseBoolean(veteranRaw);
    if (veteranParsed.error) {
      rowErrors.push(veteranParsed.error);
    }

    const statusParsed = parseStatus(statusRaw);
    if (statusParsed.error) {
      rowErrors.push(statusParsed.error);
    }

    if (roleRaw === "ADMIN") {
      rowErrors.push("CSV role import cannot assign ADMIN");
    }

    const preparedRow: PreparedMemberImportRow = {
      rowNumber,
      raw: row,
      email: emailRaw || null,
      name: name || null,
      phone,
      address: combineAddress(address, city, state, zip),
      dob: dobParsed.value,
      isDisabledVeteran: veteranParsed.value ?? false,
      isActive: resolveIsActive(statusParsed.value, options),
      errors: rowErrors,
    };

    rows.push(preparedRow);

    if (rowErrors.length > 0) {
      errors.push({ rowNumber, messages: rowErrors });
    }
  });

  return {
    headers: parsed.headers,
    rows,
    errors,
  };
}

function buildMemberUpdateInput(row: PreparedMemberImportRow): MemberForImportUpdate {
  if (!row.name || !row.email) {
    throw new Error("Invalid import row data.");
  }

  return {
    name: row.name,
    phone: row.phone,
    address: row.address,
    dob: row.dob,
    isDisabledVeteran: row.isDisabledVeteran,
    isSenior: isSeniorFromDob(row.dob),
    isActive: row.isActive,
  };
}

function generateTemporaryPassword(): string {
  return randomBytes(24).toString("base64url");
}

export async function importPreparedMemberRows(input: {
  prepared: PreparedMemberImport;
  options: MemberImportOptions;
  filename: string;
  actor: {
    memberId: string;
    email: string;
  };
  repo: MemberImportRepository;
}): Promise<MemberImportExecutionResult> {
  const totals = {
    rows: input.prepared.rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: input.prepared.errors.length,
  };

  const errors: ImportRowError[] = [...input.prepared.errors];
  let membershipYearId: string | null = null;

  for (const row of input.prepared.rows) {
    if (row.errors.length > 0 || !row.email || !row.name) {
      continue;
    }

    const existing = await input.repo.findMemberByEmail(row.email);
    let memberId: string | null = existing?.id ?? null;
    const memberInput = buildMemberUpdateInput(row);

    if (existing) {
      if (!input.options.upsertByEmail) {
        totals.skipped += 1;
        continue;
      }

      await input.repo.updateMember(existing.id, memberInput);
      totals.updated += 1;
    } else {
      const created = await input.repo.createMember({
        ...memberInput,
        email: row.email,
        passwordHash: hashPassword(generateTemporaryPassword()),
        role: "MEMBER",
      });
      memberId = created.id;
      totals.created += 1;
    }

    if (!input.options.createEnrollmentForCurrentYear || !memberId) {
      continue;
    }

    if (!membershipYearId) {
      const membershipYear = await input.repo.ensureCurrentMembershipYear();
      membershipYearId = membershipYear.id;
    }

    const existingEnrollment = await input.repo.findEnrollment(memberId, membershipYearId);
    if (!existingEnrollment) {
      await input.repo.createEnrollment({
        memberId,
        membershipYearId,
        status: "PENDING_RENEWAL",
      });
    }
  }

  await input.repo.createImportAuditLog({
    actorMemberId: input.actor.memberId,
    actorEmail: input.actor.email,
    filename: input.filename,
    options: input.options,
    totals,
    rowErrors: errors,
  });

  return {
    totals,
    errors,
  };
}
