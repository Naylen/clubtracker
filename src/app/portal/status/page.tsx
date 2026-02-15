import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ensureCurrentMembershipYear,
  isDatabaseNotInitializedError,
} from "@/services/bootstrap";
import { getMemberPortalState } from "@/services/member-portal";
import { getCurrentYearOperationalState } from "@/services/operations-state";

export default async function PortalStatusPage() {
  const user = await requireCurrentUser("/portal/status");
  let operationalState = await getCurrentYearOperationalState();

  if (operationalState.dbReady) {
    try {
      await ensureCurrentMembershipYear();
      operationalState = await getCurrentYearOperationalState();
    } catch (error) {
      if (isDatabaseNotInitializedError(error)) {
        operationalState = await getCurrentYearOperationalState();
      } else {
        throw error;
      }
    }
  }

  if (!operationalState.dbReady) {
    return (
      <main className="mx-auto max-w-4xl space-y-6 p-6">
        <PageHeader subtitle="Detailed application and membership status timeline." title="Status" />
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-amber-900">System setup required</h2>
          <p className="mt-2 text-sm text-amber-800">
            {operationalState.alerts[0] ?? "Database is not initialized. Run migrations and seed first."}
          </p>
        </section>
      </main>
    );
  }

  if (!operationalState.membershipYear) {
    return (
      <main className="mx-auto max-w-4xl space-y-6 p-6">
        <PageHeader subtitle="Detailed application and membership status timeline." title="Status" />
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Membership Year Not Ready</h2>
          <p className="mt-2 text-sm text-gray-700">
            Membership year {operationalState.currentYear} is not available yet.
          </p>
        </section>
      </main>
    );
  }

  const state = await getMemberPortalState({
    memberId: user.memberId,
    email: user.email,
  });

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader subtitle="Detailed application and membership status timeline." title="Status" />

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Application</h2>
        <div className="mt-4 space-y-2 text-sm">
          <p>
            <span className="font-medium">Status:</span>{" "}
            <StatusBadge
              tone={
                state.application?.status === "APPROVED"
                  ? "success"
                  : state.application?.status === "DENIED"
                    ? "danger"
                    : state.application?.status === "SUBMITTED"
                      ? "info"
                      : "neutral"
              }
            >
              {state.application?.status ?? "NOT_SUBMITTED"}
            </StatusBadge>
          </p>
          {state.application?.assignedPricingTier ? (
            <p>
              <span className="font-medium">Assigned Tier:</span> {state.application.assignedPricingTier.name}
            </p>
          ) : null}
          {state.application?.status === "DENIED" && state.application.denialReason ? (
            <p className="text-red-700">Denial reason: {state.application.denialReason}</p>
          ) : null}
          {!state.application && state.membershipYear?.applicationEnabled ? (
            <p>
              You have not submitted an application yet.{" "}
              <Link className="underline" href="/apply">
                Start application
              </Link>
              .
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Membership</h2>
        <div className="mt-4 space-y-2 text-sm">
          <p>
            <span className="font-medium">Enrollment:</span>{" "}
            <StatusBadge tone={state.alreadyRenewed ? "success" : "info"}>
              {state.enrollment?.status ?? "PENDING_RENEWAL"}
            </StatusBadge>
          </p>
          <p>
            <span className="font-medium">Next Action:</span> {state.cta.message}
          </p>
        </div>
      </section>
    </main>
  );
}
