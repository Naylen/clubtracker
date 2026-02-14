import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MEMBER_IMPORT_OPTIONS,
  importPreparedMemberRows,
  prepareMemberCsvImport,
  type MemberImportRepository,
} from "@/services/member-import";

describe("member CSV import parsing", () => {
  it("maps flexible headers into member fields", () => {
    const csv = [
      "Email,First Name,Last Name,Phone Number,Street,City,State,Zip,DOB,Disabled Veteran,Status",
      "jane@example.com,Jane,Doe,555-5555,12 Main,Mount Sterling,KY,40353,01/02/1960,yes,ACTIVE",
    ].join("\n");

    const prepared = prepareMemberCsvImport(csv, DEFAULT_MEMBER_IMPORT_OPTIONS);
    expect(prepared.errors).toHaveLength(0);
    expect(prepared.rows).toHaveLength(1);
    expect(prepared.rows[0]).toMatchObject({
      rowNumber: 2,
      email: "jane@example.com",
      name: "Jane Doe",
      phone: "555-5555",
      isDisabledVeteran: true,
      isActive: true,
    });
    expect(prepared.rows[0].address).toContain("12 Main");
    expect(prepared.rows[0].address).toContain("Mount Sterling");
  });
});

describe("member CSV import validation", () => {
  it("rejects invalid email and ADMIN role import", () => {
    const csv = [
      "email,name,role",
      "bad-email,Example User,ADMIN",
    ].join("\n");

    const prepared = prepareMemberCsvImport(csv, DEFAULT_MEMBER_IMPORT_OPTIONS);
    expect(prepared.errors).toHaveLength(1);
    expect(prepared.errors[0].rowNumber).toBe(2);
    expect(prepared.errors[0].messages).toContain("email format is invalid");
    expect(prepared.errors[0].messages).toContain("CSV role import cannot assign ADMIN");
  });
});

describe("member CSV import upsert behavior", () => {
  it("updates existing users and creates missing users", async () => {
    const csv = [
      "email,name",
      "existing@example.com,Existing Member Updated",
      "new@example.com,Brand New Member",
    ].join("\n");

    const prepared = prepareMemberCsvImport(csv, DEFAULT_MEMBER_IMPORT_OPTIONS);

    const findMemberByEmail = vi
      .fn<MemberImportRepository["findMemberByEmail"]>()
      .mockImplementation(async (email) => {
        if (email === "existing@example.com") {
          return { id: "member_existing" };
        }
        return null;
      });

    const createMember = vi
      .fn<MemberImportRepository["createMember"]>()
      .mockResolvedValue({ id: "member_new" });

    const updateMember = vi
      .fn<MemberImportRepository["updateMember"]>()
      .mockResolvedValue({ id: "member_existing" });

    const repo: MemberImportRepository = {
      findMemberByEmail,
      createMember,
      updateMember,
      ensureCurrentMembershipYear: vi.fn().mockResolvedValue({ id: "year_2026", year: 2026 }),
      findEnrollment: vi.fn().mockResolvedValue(null),
      createEnrollment: vi.fn().mockResolvedValue({ id: "enrollment_1" }),
      createImportAuditLog: vi.fn().mockResolvedValue(undefined),
    };

    const result = await importPreparedMemberRows({
      prepared,
      options: DEFAULT_MEMBER_IMPORT_OPTIONS,
      filename: "members.csv",
      actor: {
        memberId: "admin_1",
        email: "admin@example.com",
      },
      repo,
    });

    expect(result.totals).toMatchObject({
      rows: 2,
      created: 1,
      updated: 1,
      skipped: 0,
      errors: 0,
    });
    expect(updateMember).toHaveBeenCalledTimes(1);
    expect(createMember).toHaveBeenCalledTimes(1);
  });
});
