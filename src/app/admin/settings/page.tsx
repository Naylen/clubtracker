import { getCurrentYearInNewYork } from "@/lib/membership-dates";
import { requireAdmin } from "@/lib/auth";
import { PageShell } from "@/components/ui/page-shell";
import { MembershipSettingsClient } from "./membership-settings-client";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  await requireAdmin("/admin/settings");
  const currentYear = getCurrentYearInNewYork();
  const initialTab = searchParams?.tab;

  return (
    <PageShell
      subtitle="Configure membership-year operations: applications, renewal windows, tiers, and signup day."
      title="Settings"
    >
      <MembershipSettingsClient initialTab={initialTab} initialYear={currentYear} />
    </PageShell>
  );
}
