import Link from "next/link";

export default function ApplyNotFoundPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl items-center p-6">
      <section className="w-full rounded-xl border bg-white p-8 text-center shadow-sm">
        <h1 className="text-3xl font-bold">Applications Closed</h1>
        <p className="mt-3 text-sm text-gray-600">
          New member applications are not currently open for this membership year.
        </p>
        <div className="mt-5">
          <Link className="rounded border px-4 py-2 text-sm font-medium" href="/">
            Return Home
          </Link>
        </div>
      </section>
    </main>
  );
}
