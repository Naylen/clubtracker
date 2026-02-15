import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageShell } from "@/components/ui/page-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { getCurrentYearInNewYork } from "@/lib/membership-dates";

function formatCurrency(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountCents / 100);
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: { scope?: string };
}) {
  await requireAdmin("/admin/payments");

  const showCurrentOnly = searchParams.scope !== "all";
  const currentYear = getCurrentYearInNewYork();

  const membershipYear = await prisma.membershipYear.findUnique({
    where: { year: currentYear },
    select: { id: true },
  });

  const payments = await prisma.payment.findMany({
    where:
      showCurrentOnly && membershipYear
        ? { membershipYearId: membershipYear.id }
        : undefined,
    include: {
      member: {
        select: {
          name: true,
          email: true,
        },
      },
      membershipYear: {
        select: {
          year: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <PageShell
      actions={
        <div className="text-sm">
          {showCurrentOnly ? (
            <Link className="underline" href="/admin/payments?scope=all">
              Show all years
            </Link>
          ) : (
            <Link className="underline" href="/admin/payments">
              Show current year only
            </Link>
          )}
        </div>
      }
      subtitle="Recent payment activity across membership years."
      title="Payments"
    >

      <section className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2">Year</th>
              <th className="px-3 py-2">Member</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Paid</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr className="border-b transition hover:bg-gray-50" key={payment.id}>
                <td className="px-3 py-2">{payment.membershipYear.year}</td>
                <td className="px-3 py-2">{payment.member.name}</td>
                <td className="px-3 py-2">{payment.member.email}</td>
                <td className="px-3 py-2">{formatCurrency(payment.amountCents)}</td>
                <td className="px-3 py-2">
                  <StatusBadge
                    tone={
                      payment.status === "SUCCEEDED"
                        ? "success"
                        : payment.status === "FAILED" || payment.status === "REFUNDED"
                          ? "danger"
                          : "info"
                    }
                  >
                    {payment.status}
                  </StatusBadge>
                </td>
                <td className="px-3 py-2">{payment.createdAt.toLocaleString()}</td>
                <td className="px-3 py-2">
                  {payment.paidAt ? payment.paidAt.toLocaleString() : "-"}
                </td>
              </tr>
            ))}
            {payments.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-gray-600" colSpan={7}>
                  No payments found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </PageShell>
  );
}
