import { getCurrentYearInNewYork } from "@/lib/membership-dates";
import { requireAdmin } from "@/lib/auth";
import { MembershipSettingsClient } from "./membership-settings-client";

export default async function AdminSettingsPage() {
  await requireAdmin("/admin/settings");
  const currentYear = getCurrentYearInNewYork();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Membership Settings</h1>
        <p className="mt-1 text-sm text-gray-600">
          Configure renewal windows, pricing, capacity, and signup day for each membership year.
        </p>
      </div>

      <MembershipSettingsClient initialYear={currentYear} />
    </div>
  );
}
