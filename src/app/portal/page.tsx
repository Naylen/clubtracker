import { getCurrentYearInNewYork } from "@/lib/membership-dates";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function MemberPortalPage() {
  const user = await requireCurrentUser("/portal");
  const currentYear = getCurrentYearInNewYork();

  const membershipYear = await prisma.membershipYear.findUnique({
    where: { year: currentYear },
  });

  const enrollment = membershipYear
    ? await prisma.membershipEnrollment.findUnique({
        where: {
          memberId_membershipYearId: {
            memberId: user.memberId,
            membershipYearId: membershipYear.id,
          },
        },
      })
    : null;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Member Portal</h1>
        <form action="/api/auth/logout" method="post">
          <button className="rounded border px-3 py-2 text-sm" type="submit">
            Sign Out
          </button>
        </form>
      </div>

      <section className="rounded border bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold">Current Membership</h2>

        {membershipYear ? (
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Year:</span> {membershipYear.year}
            </p>
            <p>
              <span className="font-medium">Term:</span>{" "}
              {membershipYear.startsAt.toLocaleDateString()} -{" "}
              {membershipYear.endsAt.toLocaleDateString()}
            </p>
            <p>
              <span className="font-medium">Renewal Due:</span>{" "}
              {membershipYear.renewalDueAt.toLocaleDateString()}
            </p>
            <p>
              <span className="font-medium">Status:</span>{" "}
              {enrollment ? enrollment.status : "NOT_ENROLLED"}
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            Membership year {currentYear} has not been opened yet.
          </p>
        )}
      </section>
    </main>
  );
}
