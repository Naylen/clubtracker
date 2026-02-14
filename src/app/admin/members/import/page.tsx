import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { ImportMembersClient } from "./import-members-client";

export default async function AdminMemberImportPage() {
  await requireAdmin("/admin/members/import");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Import Members from CSV</h1>
        <Link className="text-sm font-medium underline" href="/admin/members">
          Back to member roster
        </Link>
      </div>

      <ImportMembersClient />
    </div>
  );
}
