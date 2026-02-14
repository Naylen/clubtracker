import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentYearInNewYork } from "@/lib/membership-dates";

export default async function AdminDashboardPage() {
  await requireAdmin("/admin");

  const currentYear = getCurrentYearInNewYork();
  const membershipYear = await prisma.membershipYear.findUnique({
    where: { year: currentYear },
  });

  const [activeMembers, activeEnrollments] = await Promise.all([
    prisma.member.count({ where: { isActive: true, role: "MEMBER" } }),
    membershipYear
      ? prisma.membershipEnrollment.count({
          where: {
            membershipYearId: membershipYear.id,
            status: "ACTIVE",
          },
        })
      : Promise.resolve(0),
  ]);

  const capacityRemaining = membershipYear
    ? Math.max(0, membershipYear.capacity - activeEnrollments)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded border bg-white p-4">
          <p className="text-sm text-gray-500">Active Members</p>
          <p className="text-2xl font-bold">{activeMembers}</p>
        </div>

        <div className="rounded border bg-white p-4">
          <p className="text-sm text-gray-500">Active Enrollments ({currentYear})</p>
          <p className="text-2xl font-bold">{activeEnrollments}</p>
        </div>

        <div className="rounded border bg-white p-4">
          <p className="text-sm text-gray-500">Capacity Remaining</p>
          <p className="text-2xl font-bold">{capacityRemaining}</p>
        </div>
      </section>

      <section className="rounded border bg-white p-4">
        <p className="mb-3 text-sm text-gray-600">
          {membershipYear
            ? `Current year ${membershipYear.year} is open. Renewal due by ${membershipYear.renewalDueAt.toLocaleDateString()}.`
            : `No membership year exists yet for ${currentYear}. Use the current-year action endpoint to create it.`}
        </p>
        <Link className="text-sm font-medium underline" href="/admin/members">
          Manage member roster
        </Link>
      </section>
    </div>
  );
}
