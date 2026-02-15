import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getMemberPortalState } from "@/services/member-portal";
import { PayRenewalButton } from "./pay-renewal-button";

function formatCurrency(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountCents / 100);
}

function badgeForApplicationStatus(status: string | null): { label: string; tone: "info" | "success" | "danger" | "neutral" } {
  if (!status) {
    return { label: "NOT_SUBMITTED", tone: "neutral" };
  }
  if (status === "APPROVED") {
    return { label: "APPROVED", tone: "success" };
  }
  if (status === "DENIED") {
    return { label: "DENIED", tone: "danger" };
  }
  if (status === "SUBMITTED") {
    return { label: "SUBMITTED", tone: "info" };
  }
  return { label: status, tone: "neutral" };
}

export default async function MemberPortalPage() {
  const user = await requireCurrentUser("/portal");
  const state = await getMemberPortalState({
    memberId: user.memberId,
    email: user.email,
  });

  const appBadge = badgeForApplicationStatus(state.application?.status ?? null);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        subtitle="Your current-year membership and application status at a glance."
        title="Member Portal"
      />

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border bg-white p-5 shadow-sm md:col-span-2">
          <h2 className="text-xl font-semibold">Membership Status</h2>
          {state.membershipYear ? (
            <div className="mt-4 space-y-3 text-sm">
              <p>
                <span className="font-medium">Membership Year:</span> {state.membershipYear.year}
              </p>
              <p>
                <span className="font-medium">Term:</span>{" "}
                {state.membershipYear.startsAt.toLocaleDateString()} - {state.membershipYear.endsAt.toLocaleDateString()}
              </p>
              <p>
                <span className="font-medium">Renewal Due:</span>{" "}
                {state.membershipYear.renewalDueAt.toLocaleDateString()}
              </p>
              <p>
                <span className="font-medium">Enrollment Status:</span>{" "}
                <StatusBadge tone={state.alreadyRenewed ? "success" : "info"}>
                  {state.enrollment?.status ?? "PENDING_RENEWAL"}
                </StatusBadge>
              </p>
              {state.effectiveTier ? (
                <p>
                  <span className="font-medium">Pricing Tier:</span> {state.effectiveTier.name} ({formatCurrency(state.effectiveTier.amountCents)})
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-600">Membership year is not available yet.</p>
          )}
        </article>

        <article className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Application Status</h2>
          <div className="mt-4 space-y-3 text-sm">
            <p>
              <StatusBadge tone={appBadge.tone}>{appBadge.label}</StatusBadge>
            </p>
            <p className="text-gray-700">{state.cta.message}</p>
            {state.application?.status === "DENIED" && state.application.denialReason ? (
              <p className="text-red-700">Reason: {state.application.denialReason}</p>
            ) : null}
            {state.membershipYear?.applicationEnabled && !state.isExistingMember && state.application?.status !== "APPROVED" ? (
              <Link className="inline-flex rounded border px-3 py-1.5 text-sm font-medium" href="/apply">
                {state.application ? "Update Application" : "Start Application"}
              </Link>
            ) : null}
          </div>
        </article>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Next Action</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <PayRenewalButton disabled={!state.canPay} disabledReason={state.cta.message} />
          <Link className="rounded border px-3 py-2 text-sm font-medium" href="/portal/profile">
            My Profile
          </Link>
          <Link className="rounded border px-3 py-2 text-sm font-medium" href="/portal/status">
            Full Status
          </Link>
        </div>
      </section>
    </main>
  );
}
