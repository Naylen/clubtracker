import Link from "next/link";
import { getCurrentYearOperationalState } from "@/services/operations-state";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function HomePage() {
  const opsState = await getCurrentYearOperationalState();

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <section className="rounded-2xl border bg-white p-8 shadow-sm">
        <h1 className="text-4xl font-bold">Montgomery County Fish &amp; Game Club</h1>
        <p className="mt-2 text-lg text-gray-600">6701 Old Nest Egg Rd, Mt Sterling, KY 40353</p>
        <p className="mt-1 text-gray-500">501(c)(7) Non-Profit - Established 1976</p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <StatusBadge tone={opsState.applicationPublicOpen ? "success" : "info"}>
            Applications {opsState.applicationPublicOpen ? "Open" : "Closed"}
          </StatusBadge>
          <StatusBadge tone={opsState.capacityRemaining > 0 ? "neutral" : "danger"}>
            Capacity {opsState.activeEnrollments}/{opsState.membershipYear?.membershipCap ?? 350}
          </StatusBadge>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="rounded bg-gray-900 px-4 py-2 text-sm font-semibold text-white" href="/login">
            Sign In
          </Link>
          {opsState.applicationPublicOpen ? (
            <Link className="rounded border px-4 py-2 text-sm font-semibold" href="/apply">
              Apply for Membership
            </Link>
          ) : null}
          <Link className="rounded border px-4 py-2 text-sm font-semibold" href="/portal">
            Member Portal
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Current Year</p>
          <p className="mt-2 text-2xl font-bold">{opsState.year}</p>
        </article>
        <article className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Renewal Due</p>
          <p className="mt-2 text-sm font-semibold">
            {opsState.membershipYear?.renewalDueAt.toLocaleDateString() ?? "Not scheduled"}
          </p>
        </article>
        <article className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Disciplines</p>
          <p className="mt-2 text-sm">Archery • Pistol • Rifle • Trap</p>
        </article>
      </section>
    </main>
  );
}
