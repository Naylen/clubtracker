import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin("/admin");

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50">
      <div className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Admin Operations Console
            </p>
            <p className="text-sm text-gray-600">
              Volunteer tools for membership-year operations and member support.
            </p>
          </div>
          <p className="text-xs text-gray-500">{user.email}</p>
        </div>
      </div>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
