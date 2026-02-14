import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function PaySuccessPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const sessionId = searchParams.session_id;

  const payment = sessionId
    ? await prisma.payment.findFirst({
        where: { externalId: sessionId },
        include: {
          membershipYear: true,
        },
      })
    : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center p-6">
      <h1 className="mb-4 text-3xl font-bold">Payment Processing</h1>
      <div className="space-y-3 rounded border bg-white p-6 text-sm">
        <p>
          Thank you. Stripe has redirected you back to MCFGC. Your payment is
          being processed and will be confirmed shortly.
        </p>
        {payment ? (
          <>
            <p>
              <span className="font-medium">Year:</span> {payment.membershipYear.year}
            </p>
            <p>
              <span className="font-medium">Status:</span> {payment.status}
            </p>
            <p>
              <span className="font-medium">Paid At:</span>{" "}
              {payment.paidAt ? payment.paidAt.toLocaleString() : "Pending webhook confirmation"}
            </p>
          </>
        ) : (
          <p>We could not find a matching payment yet. Please refresh in a moment.</p>
        )}
        <div className="pt-2">
          <Link className="underline" href="/portal">
            Return to member portal
          </Link>
        </div>
      </div>
    </main>
  );
}
