import { requireAdmin } from "@/lib/auth";
import { Container } from "@/components/ui/container";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin("/admin");

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50">
      <div className="border-b bg-white">
        <Container className="flex items-center justify-between py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Admin Operations Console
            </p>
            <p className="text-sm text-gray-600">
              Volunteer tools for membership-year operations and member support.
            </p>
          </div>
          <p className="text-xs text-gray-500">{user.email}</p>
        </Container>
      </div>
      <main className="space-y-6 py-6">{children}</main>
    </div>
  );
}
