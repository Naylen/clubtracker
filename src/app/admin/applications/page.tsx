import Link from "next/link";
import { ApplicationStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentYearInNewYork } from "@/lib/membership-dates";

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
    select: { id: true },
  });

  const applications = membershipYear
    ? await prisma.membershipApplication.findMany({
        where: {
          membershipYearId: membershipYear.id,
          ...(selectedStatus !== "ALL" ? { status: selectedStatus } : {}),
        },
        include: {
          member: {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Membership Applications</h1>
        <p className="mt-1 text-sm text-gray-600">
          Review submitted applications and assign pricing tiers.
        </p>
      </div>

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
                  <th className="px-3 py-2">Applicant</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Requested Vet Discount</th>
                  <th className="px-3 py-2">Assigned Tier</th>
                  <th className="px-3 py-2">Submitted</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((application) => (
                  <tr className="border-b" key={application.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{application.member.name}</div>
                      <div className="text-xs text-gray-600">{application.member.email}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full border px-2 py-0.5 text-xs">
                        {application.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {application.requestedDisabledVeteranDiscount ? "Yes" : "No"}
                    </td>
                    <td className="px-3 py-2">
                      {application.assignedPricingTier
                        ? `${application.assignedPricingTier.name} ($${(
                            application.assignedPricingTier.amountCents / 100
                          ).toFixed(2)})`
                        : "-"}
                    </td>
                    <td className="px-3 py-2">
                      {application.submittedAt
                        ? application.submittedAt.toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        className="rounded border px-3 py-1 text-xs font-medium"
                        href={`/admin/applications/${application.id}`}
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
