import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createOrOpenCurrentYear } from "@/services/membership";
import { getCurrentYearOperationalState } from "@/services/operations-state";

function formatDateTime(value: Date | null): string {
  if (!value) {
    return "Not set";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(value);
}

function toneFromAlert(alert: string): "warning" | "danger" | "info" {
  if (alert.toLowerCase().includes("full")) {
    return "danger";
  }
  if (alert.toLowerCase().includes("closed")) {
    return "info";
  }
  return "warning";
}

export default async function AdminDashboardPage() {
  await requireAdmin("/admin");
  const state = await getCurrentYearOperationalState();

  async function createOrOpenYearAction() {
    "use server";

    await requireAdmin("/admin");
    await createOrOpenCurrentYear();
    revalidatePath("/admin");
    revalidatePath("/admin/settings");
    revalidatePath("/");
    revalidatePath("/apply");
    revalidatePath("/portal");
  }

  async function toggleApplicationsAction(formData: FormData) {
    "use server";

    await requireAdmin("/admin");
    const membershipYearId = String(formData.get("membershipYearId") ?? "");
    const nextState = formData.get("nextState") === "true";

    if (!membershipYearId) {
      throw new Error("Membership year is required.");
    }

    await prisma.membershipYear.update({
      where: { id: membershipYearId },
      data: { applicationEnabled: nextState },
    });

    revalidatePath("/admin");
    revalidatePath("/admin/settings");
    revalidatePath("/");
    revalidatePath("/apply");
  }

  const activeTierCount = state.membershipYear
    ? await prisma.pricingTier.count({
        where: {
          membershipYearId: state.membershipYear.id,
          isActive: true,
        },
      })
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <form action={createOrOpenYearAction}>
            <button className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white" type="submit">
              Create / Open Current Year
            </button>
          </form>
        }
        subtitle="Live operational snapshot for the current membership year."
        title="Control Center"
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Current Year</p>
          <p className="mt-2 text-2xl font-bold">{state.year}</p>
        </article>

        <article className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Members Active / Cap</p>
          <p className="mt-2 text-2xl font-bold">
            {state.activeEnrollments} / {state.membershipYear?.membershipCap ?? 0}
          </p>
          <p className="mt-1 text-xs text-gray-500">{state.capacityRemaining} slots remaining</p>
        </article>

        <article className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Renewal Opens</p>
          <p className="mt-2 text-sm font-semibold">
            {formatDateTime(state.membershipYear?.renewalOpensAt ?? null)}
          </p>
          <p className="mt-2 text-xs uppercase tracking-wide text-gray-500">Renewal Due</p>
          <p className="text-sm font-semibold">
            {formatDateTime(state.membershipYear?.renewalDueAt ?? null)}
          </p>
        </article>

        <article className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Applications Open (public /apply)
          </p>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge tone={state.applicationPublicOpen ? "success" : "info"}>
              {state.applicationPublicOpen ? "OPEN" : "CLOSED"}
            </StatusBadge>
            {state.membershipYear ? (
              <form action={toggleApplicationsAction}>
                <input name="membershipYearId" type="hidden" value={state.membershipYear.id} />
                <input
                  name="nextState"
                  type="hidden"
                  value={state.membershipYear.applicationEnabled ? "false" : "true"}
                />
                <button className="rounded border px-2 py-1 text-xs font-medium" type="submit">
                  {state.membershipYear.applicationEnabled ? "Close" : "Open"}
                </button>
              </form>
            ) : null}
          </div>
          {state.applicationWindow.opensAt || state.applicationWindow.closesAt ? (
            <p className="mt-2 text-xs text-gray-500">
              Window:{" "}
              {state.applicationWindow.opensAt
                ? formatDateTime(new Date(state.applicationWindow.opensAt))
                : "Anytime"}{" "}
              -{" "}
              {state.applicationWindow.closesAt
                ? formatDateTime(new Date(state.applicationWindow.closesAt))
                : "No close"}
            </p>
          ) : null}
        </article>

        <article className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Signup Day</p>
          <p className="mt-2 text-sm font-semibold">
            {formatDateTime(state.membershipYear?.signupDate ?? null)}
          </p>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <ActionTile
          count={state.pendingApplications}
          href="/admin/applications?status=SUBMITTED"
          label="Review Applications"
        />
        <ActionTile count={state.unpaidRenewals} href="/admin/payments" label="Unpaid Renewals" />
        <ActionTile href="/admin/members/import" label="Import Members" />
        <ActionTile href="/admin/communications" label="Send Broadcast" />
        <ActionTile
          count={activeTierCount}
          href="/admin/settings"
          label="Manage Pricing Tiers"
          subtitle="Active tiers"
        />
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Alerts</h2>
        {state.alerts.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No urgent operational alerts right now.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {state.alerts.map((alert) => (
              <li className="flex items-center gap-2 text-sm" key={alert}>
                <StatusBadge tone={toneFromAlert(alert)}>{toneFromAlert(alert).toUpperCase()}</StatusBadge>
                <span>{alert}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ActionTile({
  label,
  href,
  count,
  subtitle,
}: {
  label: string;
  href: string;
  count?: number;
  subtitle?: string;
}) {
  return (
    <Link className="rounded-xl border bg-white p-4 shadow-sm transition hover:border-gray-300" href={href}>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{count ?? "Open"}</p>
      {subtitle ? <p className="mt-1 text-xs text-gray-500">{subtitle}</p> : null}
    </Link>
  );
}
