import Link from "next/link";
import { ApplicationStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  calculateAgeOnDate,
  determineSignupDay,
  getCurrentYearInNewYork,
  isSeniorOnDate,
} from "@/lib/membership-dates";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

type SearchParams = {
  year?: string;
  status?: string;
};

const STATUS_OPTIONS: Array<ApplicationStatus | "ALL"> = [
  "ALL",
  "SUBMITTED",
  "APPROVED",
  "DENIED",
  "DRAFT",
];

function toneForStatus(status: ApplicationStatus): "info" | "success" | "danger" | "neutral" {
  if (status === "APPROVED") {
    return "success";
  }
  if (status === "DENIED") {
    return "danger";
  }
  if (status === "SUBMITTED") {
    return "info";
  }
  return "neutral";
}

function parseYear(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) {
    return getCurrentYearInNewYork();
  }
  return parsed;
}

function parseStatus(value: string | undefined): ApplicationStatus | "ALL" {
  if (STATUS_OPTIONS.includes(value as ApplicationStatus | "ALL")) {
    return value as ApplicationStatus | "ALL";
  }
  return "SUBMITTED";
}

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin("/admin/applications");

  const selectedYear = parseYear(searchParams.year);
  const selectedStatus = parseStatus(searchParams.status);

  const membershipYear = await prisma.membershipYear.findUnique({
    where: { year: selectedYear },
    select: { id: true, year: true, signupDate: true },
  });

  const applications = membershipYear
    ? await prisma.membershipApplication.findMany({
        where: {
          membershipYearId: membershipYear.id,
          ...(selectedStatus !== "ALL" ? { status: selectedStatus } : {}),
        },
        include: {
          createdMember: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          assignedPricingTier: {
            select: {
              name: true,
              code: true,
              amountCents: true,
            },
          },
        },
        orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      })
    : [];

  const signupDay = membershipYear
    ? determineSignupDay({ year: membershipYear.year, signupDate: membershipYear.signupDate })
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        subtitle="Review submitted applications and decide approval, pricing tier, and discount outcomes."
        title="Membership Applications"
      />

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Year</span>
            <input
              className="w-32 rounded border p-2"
              defaultValue={selectedYear}
              max={2100}
              min={2000}
              name="year"
              type="number"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Status</span>
            <select className="rounded border p-2" defaultValue={selectedStatus} name="status">
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded border px-4 py-2 text-sm font-medium" type="submit">
            Apply Filters
          </button>
        </form>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        {!membershipYear ? (
          <p className="text-sm text-gray-600">No membership year record exists for {selectedYear}.</p>
        ) : applications.length === 0 ? (
          <p className="text-sm text-gray-600">No applications match the selected filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Age on Signup Day</th>
                  <th className="px-3 py-2">DV Requested</th>
                  <th className="px-3 py-2">Auto Senior</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">View</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((application) => {
                  const ageOnSignupDay =
                    signupDay && application.applicantDob
                      ? calculateAgeOnDate(application.applicantDob, signupDay)
                      : null;
                  const autoSenior =
                    signupDay && application.applicantDob
                      ? isSeniorOnDate(application.applicantDob, signupDay)
                      : false;

                  return (
                    <tr className="border-b" key={application.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium">
                          {application.applicantFirstName} {application.applicantLastName}
                        </div>
                        <div className="text-xs text-gray-600">{application.applicantEmail}</div>
                      </td>
                      <td className="px-3 py-2">{ageOnSignupDay ?? "-"}</td>
                      <td className="px-3 py-2">
                        {application.requestedDisabledVeteranDiscount ? "Yes" : "No"}
                      </td>
                      <td className="px-3 py-2">
                        {autoSenior ? (
                          <StatusBadge tone="info">Auto: Senior</StatusBadge>
                        ) : (
                          <StatusBadge tone="neutral">No</StatusBadge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={toneForStatus(application.status)}>
                            {application.status}
                          </StatusBadge>
                          {application.status === "APPROVED" &&
                          application.assignedPricingTier ? (
                            <StatusBadge tone="info">PAYMENT_AVAILABLE</StatusBadge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          className="rounded border px-3 py-1 text-xs font-medium"
                          href={`/admin/applications/${application.id}`}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
