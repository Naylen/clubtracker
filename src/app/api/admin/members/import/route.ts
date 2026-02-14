import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createOrOpenCurrentYear } from "@/services/membership";
import {
  DEFAULT_MEMBER_IMPORT_OPTIONS,
  IMPORT_PREVIEW_LIMIT,
  importPreparedMemberRows,
  prepareMemberCsvImport,
  type MemberImportOptions,
} from "@/services/member-import";

function isTruthyFormValue(value: FormDataEntryValue | null): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}

function parseImportOptions(formData: FormData): MemberImportOptions {
  const upsertValue = formData.get("upsertByEmail");
  const markActiveValue = formData.get("markImportedMembersActive");
  const createEnrollmentValue = formData.get("createEnrollmentForCurrentYear");

  return {
    upsertByEmail:
      upsertValue === null
        ? DEFAULT_MEMBER_IMPORT_OPTIONS.upsertByEmail
        : isTruthyFormValue(upsertValue),
    createEnrollmentForCurrentYear:
      createEnrollmentValue === null
        ? DEFAULT_MEMBER_IMPORT_OPTIONS.createEnrollmentForCurrentYear
        : isTruthyFormValue(createEnrollmentValue),
    markImportedMembersActive:
      markActiveValue === null
        ? DEFAULT_MEMBER_IMPORT_OPTIONS.markImportedMembersActive
        : isTruthyFormValue(markActiveValue),
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV file is required." }, { status: 400 });
    }

    const mode = String(formData.get("mode") ?? "preview").trim().toLowerCase();
    if (mode !== "preview" && mode !== "import") {
      return NextResponse.json({ error: "mode must be preview or import." }, { status: 400 });
    }

    const options = parseImportOptions(formData);
    const csvText = await file.text();
    const prepared = prepareMemberCsvImport(csvText, options);

    const previewRows = prepared.rows.slice(0, IMPORT_PREVIEW_LIMIT).map((row) => ({
      rowNumber: row.rowNumber,
      email: row.email,
      name: row.name,
      isActive: row.isActive,
      errors: row.errors,
    }));

    if (mode === "preview") {
      return NextResponse.json({
        mode,
        filename: file.name,
        headers: prepared.headers,
        options,
        totals: {
          rows: prepared.rows.length,
          validRows: prepared.rows.length - prepared.errors.length,
          errors: prepared.errors.length,
        },
        errors: prepared.errors,
        preview: previewRows,
      });
    }

    const result = await importPreparedMemberRows({
      prepared,
      options,
      filename: file.name,
      actor: {
        memberId: user.memberId,
        email: user.email,
      },
      repo: {
        findMemberByEmail: (email) =>
          prisma.member.findUnique({
            where: { email },
            select: { id: true },
          }),
        createMember: (data) => prisma.member.create({ data, select: { id: true } }),
        updateMember: (memberId, data) =>
          prisma.member.update({
            where: { id: memberId },
            data,
            select: { id: true },
          }),
        ensureCurrentMembershipYear: () =>
          createOrOpenCurrentYear().then((membershipYear) => ({
            id: membershipYear.id,
            year: membershipYear.year,
          })),
        findEnrollment: (memberId, membershipYearId) =>
          prisma.membershipEnrollment.findUnique({
            where: {
              memberId_membershipYearId: {
                memberId,
                membershipYearId,
              },
            },
            select: { id: true },
          }),
        createEnrollment: (data) =>
          prisma.membershipEnrollment.create({
            data,
            select: { id: true },
          }),
        createImportAuditLog: async (audit) => {
          await prisma.communicationLog.create({
            data: {
              memberId: audit.actorMemberId,
              channel: "EMAIL",
              toAddress: audit.actorEmail,
              subject: "MEMBERS_CSV_IMPORT",
              bodyPreview: `Imported ${audit.totals.rows} CSV rows`,
              sentAt: new Date(),
              meta: {
                action: "MEMBERS_CSV_IMPORT",
                filename: audit.filename,
                options: audit.options,
                totals: audit.totals,
                rowErrors: audit.rowErrors,
                importedAt: new Date().toISOString(),
              },
            },
          });
          console.info("MEMBERS_CSV_IMPORT", {
            actor: audit.actorEmail,
            filename: audit.filename,
            totals: audit.totals,
          });
        },
      },
    });

    return NextResponse.json({
      mode,
      filename: file.name,
      headers: prepared.headers,
      options,
      totals: result.totals,
      errors: result.errors,
      preview: previewRows,
    });
  } catch (error) {
    console.error("Member CSV import failed", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected import error.",
      },
      { status: 500 }
    );
  }
}
