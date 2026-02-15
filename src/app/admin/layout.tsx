import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin("/admin");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-4">
          <nav className="flex items-center gap-4 text-sm">
            <Link className="font-semibold" href="/admin">
              Admin Dashboard
            </Link>
            <Link href="/admin/members">Member Roster</Link>
            <Link href="/admin/applications">Applications</Link>
            <Link href="/admin/settings">Settings</Link>
            <Link href="/admin/payments">Payments</Link>
            <Link href="/admin/communications">Communications</Link>
            <Link href="/portal">Member Portal</Link>
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span>{user.email}</span>
            <form action="/api/auth/logout" method="post">
              <button className="rounded border px-3 py-1.5" type="submit">
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </div>
  );
}
