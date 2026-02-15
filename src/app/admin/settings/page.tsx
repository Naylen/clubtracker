import { getCurrentYearInNewYork } from "@/lib/membership-dates";
import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { MembershipSettingsClient } from "./membership-settings-client";

export default async function AdminSettingsPage() {
  await requireAdmin("/admin/settings");
  const currentYear = getCurrentYearInNewYork();

  return (
    <div className="space-y-6">
      <PageHeader
        subtitle="Configure membership-year operations: applications, renewal windows, tiers, and signup day."
        title="Settings"
      />

      <MembershipSettingsClient initialYear={currentYear} />
    </div>
  );
}
