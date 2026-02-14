import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  type BroadcastAudience,
  MAX_BROADCAST_RECIPIENTS,
  sendBroadcastEmail,
} from "@/services/communication";

function parseAudience(value: string): BroadcastAudience {
  return value === "ALL_ACTIVE_MEMBERS" ? "ALL_ACTIVE_MEMBERS" : "CURRENT_YEAR_ACTIVE";
}

export default async function AdminCommunicationsPage({
  searchParams,
}: {
  searchParams: { sent?: string; failed?: string; recipients?: string; error?: string };
}) {
  await requireAdmin("/admin/communications");

  async function sendBroadcastAction(formData: FormData) {
    "use server";

    await requireAdmin("/admin/communications");

    const subject = String(formData.get("subject") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    const audience = parseAudience(String(formData.get("audience") ?? "CURRENT_YEAR_ACTIVE"));

    if (!subject || !body) {
      redirect("/admin/communications?error=Subject%20and%20body%20are%20required");
    }

    try {
      const result = await sendBroadcastEmail({
        subject,
        body,
        audience,
        maxRecipients: MAX_BROADCAST_RECIPIENTS,
      });

      redirect(
        `/admin/communications?recipients=${result.recipients}&sent=${result.sentCount}&failed=${result.failedCount}`
      );
    } catch (error) {
      const message =
        error instanceof Error ? encodeURIComponent(error.message) : "Broadcast%20failed";
      redirect(`/admin/communications?error=${message}`);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Communications</h1>

      {searchParams.error ? (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {searchParams.error}
        </p>
      ) : null}

      {searchParams.sent ? (
        <p className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-700">
          Sent {searchParams.sent} of {searchParams.recipients} emails ({searchParams.failed} failed).
        </p>
      ) : null}

      <section className="rounded border bg-white p-6">
        <form action={sendBroadcastAction} className="space-y-4">
          <label className="block text-sm font-medium">
            Audience
            <select className="mt-1 w-full rounded border p-2" name="audience">
              <option value="CURRENT_YEAR_ACTIVE">Current Year Active Members</option>
              <option value="ALL_ACTIVE_MEMBERS">All Active Members</option>
            </select>
          </label>

          <label className="block text-sm font-medium">
            Subject
            <input className="mt-1 w-full rounded border p-2" name="subject" required />
          </label>

          <label className="block text-sm font-medium">
            Body
            <textarea className="mt-1 w-full rounded border p-2" name="body" required rows={8} />
          </label>

          <button className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white" type="submit">
            Send Broadcast
          </button>
        </form>
      </section>
    </div>
  );
}
