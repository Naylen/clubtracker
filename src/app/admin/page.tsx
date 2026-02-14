import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentYearInNewYork } from "@/lib/membership-dates";
import { createOrOpenCurrentYear } from "@/services/membership";

export default async function AdminDashboardPage() {
  await requireAdmin("/admin");

  async function createOrOpenYearAction() {
    "use server";

    await requireAdmin("/admin");
    await createOrOpenCurrentYear();
    revalidatePath("/admin");
    revalidatePath("/portal");
  }

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
        <form action={createOrOpenYearAction}>
          <button
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            type="submit"
          >
            Create or Open Current Year
          </button>
        </form>
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
            : `No membership year exists yet for ${currentYear}.`}
        </p>
        <Link className="text-sm font-medium underline" href="/admin/members">
          Manage member roster
        </Link>
      </section>
    </div>
  );
}
