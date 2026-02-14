import Link from "next/link";

export default function PayCancelPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center p-6">
      <h1 className="mb-4 text-3xl font-bold">Payment Cancelled</h1>
      <div className="space-y-3 rounded border bg-white p-6 text-sm">
        <p>Your renewal checkout was cancelled. No charge was made.</p>
        <Link className="underline" href="/portal">
          Return to member portal
        </Link>
      </div>
    </main>
  );
}
