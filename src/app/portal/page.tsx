import { getCurrentYearInNewYork } from "@/lib/membership-dates";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getLateRenewalPolicy,
  getRenewalPriceForMember,
  isRenewalBlockedByLatePolicy,
} from "@/services/membership";
import { PayRenewalButton } from "./pay-renewal-button";

function formatCurrency(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountCents / 100);
}

export default async function MemberPortalPage() {
  const user = await requireCurrentUser("/portal");
  const currentYear = getCurrentYearInNewYork();

  const [member, membershipYear] = await Promise.all([
    prisma.member.findUnique({ where: { id: user.memberId } }),
    prisma.membershipYear.findUnique({
      where: { year: currentYear },
    }),
  ]);

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

  const price =
    member && membershipYear ? getRenewalPriceForMember(member, membershipYear) : null;
  const lateRenewalPolicy = await getLateRenewalPolicy();
  const renewalBlocked = membershipYear
    ? await isRenewalBlockedByLatePolicy({ membershipYear })
    : false;

  const alreadyRenewed = enrollment?.status === "ACTIVE";
  const canPay = Boolean(member && membershipYear && !alreadyRenewed && !renewalBlocked);

  let disabledReason = "";
  if (!membershipYear) {
    disabledReason = `Membership year ${currentYear} has not been opened yet.`;
  } else if (alreadyRenewed) {
    disabledReason = "Your renewal is already paid and active for this year.";
  } else if (renewalBlocked) {
    disabledReason = "Renewal is past due and late renewals are currently disabled.";
  }

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
          <div className="space-y-3 text-sm">
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
              {enrollment ? enrollment.status : "PENDING_RENEWAL"}
            </p>
            {price ? (
              <>
                <p>
                  <span className="font-medium">Renewal Price:</span>{" "}
                  {formatCurrency(price.amountCents)}
                </p>
                <p>
                  <span className="font-medium">Discount:</span>{" "}
                  {price.discountReason ?? "NONE"}
                </p>
              </>
            ) : null}
            <p>
              <span className="font-medium">Late Renewal Policy:</span>{" "}
              {lateRenewalPolicy.enabled ? "Enabled" : "Disabled"}
            </p>

            <div className="pt-3">
              <PayRenewalButton
                disabled={!canPay}
                disabledReason={disabledReason}
              />
            </div>
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
