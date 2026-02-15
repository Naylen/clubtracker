import { requireCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getMemberPortalState } from "@/services/member-portal";
import { PayRenewalButton } from "../pay-renewal-button";

function formatCurrency(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountCents / 100);
}

export default async function PortalPaymentsPage() {
  const user = await requireCurrentUser("/portal/payments");
  const state = await getMemberPortalState({
    memberId: user.memberId,
    email: user.email,
  });

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader subtitle="Review renewal payment availability and amount." title="Payments" />

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Current Year Payment</h2>
        {state.membershipYear ? (
          <div className="mt-4 space-y-3 text-sm">
            <p>
              <span className="font-medium">Year:</span> {state.membershipYear.year}
            </p>
            <p>
              <span className="font-medium">Renewal Due:</span>{" "}
              {state.membershipYear.renewalDueAt.toLocaleDateString()}
            </p>
            <p>
              <span className="font-medium">Late Renewals:</span>{" "}
              <StatusBadge tone={state.lateRenewalPolicy.enabled ? "success" : "warning"}>
                {state.lateRenewalPolicy.enabled ? "ENABLED" : "DISABLED"}
              </StatusBadge>
            </p>
            {state.effectiveTier ? (
              <p>
                <span className="font-medium">Amount:</span> {formatCurrency(state.effectiveTier.amountCents)} (
                {state.effectiveTier.name})
              </p>
            ) : (
              <p>No active pricing tier has been assigned yet.</p>
            )}

            <div className="pt-2">
              <PayRenewalButton disabled={!state.canPay} disabledReason={state.cta.message} />
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-600">Membership year is not available yet.</p>
        )}
      </section>
    </main>
  );
}
