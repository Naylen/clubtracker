import Link from "next/link";

export function SetupRequiredBanner({
  message,
}: {
  message: string;
}) {
  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
      <h2 className="text-base font-semibold">System Setup Required</h2>
      <p className="mt-1">{message}</p>
      <Link
        className="mt-3 inline-flex rounded border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
        href="/setup"
      >
        Run migrations / seed
      </Link>
    </section>
  );
}

