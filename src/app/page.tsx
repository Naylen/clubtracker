import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="mb-4 text-4xl font-bold">
        Montgomery County Fish &amp; Game Club
      </h1>
      <p className="mb-2 text-lg text-gray-600">
        6701 Old Nest Egg Rd, Mt Sterling, KY 40353
      </p>
      <p className="text-gray-500">501(c)(7) Non-Profit - Established 1976</p>

      <div className="mt-8 max-w-md rounded-lg border bg-white p-6 text-center shadow-sm">
        <h2 className="mb-2 text-xl font-semibold">Membership Management</h2>
        <p className="text-gray-600">
          Annual membership portal for renewals, payments, and club
          communications.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link className="rounded bg-gray-900 px-4 py-2 text-sm text-white" href="/login">
            Sign In
          </Link>
          <Link className="rounded border px-4 py-2 text-sm" href="/portal">
            Member Portal
          </Link>
        </div>
      </div>
    </main>
  );
}
