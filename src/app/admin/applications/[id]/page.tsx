import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatAddress } from "@/lib/address";
import { determineSignupDay } from "@/lib/membership-dates";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ApplicationApprovalError,
  approveMembershipApplication,
  denyMembershipApplication,
} from "@/services/application-approval";
import { deriveApplicationReviewState } from "@/services/application-review";

type SearchParams = {
  error?: string;
  success?: string;
};

function formatCurrency(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountCents / 100);
}

function toneForStatus(status: string): "info" | "success" | "danger" | "neutral" {
  if (status === "APPROVED") {
    return "success";
  }
  if (status === "DENIED") {
    return "danger";
  }
  if (status === "SUBMITTED") {
    return "info";
  }
  return "neutral";
}

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: SearchParams;
}) {
  await requireAdmin(`/admin/applications/${params.id}`);

  const application = await prisma.membershipApplication.findUnique({
    where: { id: params.id },
    include: {
      createdMember: {
        select: {
          id: true,
          email: true,
          isActive: true,
        },
      },
      membershipYear: true,
      assignedPricingTier: true,
      reviewedByMember: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!application) {
    notFound();
  }

  const tiers = await prisma.pricingTier.findMany({
    where: {
      membershipYearId: application.membershipYearId,
      isActive: true,
    },
    orderBy: [{ priority: "asc" }, { amountCents: "asc" }, { name: "asc" }],
  });

  const tierByCode = new Map(tiers.map((tier) => [tier.code, tier]));

  const signupDay = determineSignupDay({
    year: application.membershipYear.year,
    signupDate: application.membershipYear.signupDate,
  });
  const reviewState = deriveApplicationReviewState({
    applicantDob: application.applicantDob,
    signupDay,
    requestedDisabledVeteranDiscount: application.requestedDisabledVeteranDiscount,
    availableTiers: tiers,
  });
  const ageOnSignupDay = reviewState.ageOnSignupDay;
  const seniorAutoEligible = reviewState.seniorAutoEligible;

  const suggestedTier =
    tierByCode.get(reviewState.suggestedTierCode) ??
    tiers[0] ??
    null;

  async function approveAction(formData: FormData) {
    "use server";

    const reviewer = await requireAdmin(`/admin/applications/${params.id}`);
    const applicationId = String(formData.get("applicationId") ?? "");
    const assignedPricingTierId = String(formData.get("assignedPricingTierId") ?? "");
    const disabledVeteranApproved = formData.get("disabledVeteranApproved") === "on";
    const confirmSeniorOverride = formData.get("confirmSeniorOverride") === "on";

    if (!applicationId || !assignedPricingTierId) {
      redirect(`/admin/applications/${params.id}?error=Pricing%20tier%20selection%20is%20required.`);
    }

    try {
      await approveMembershipApplication({
        applicationId,
        reviewer: {
          memberId: reviewer.memberId,
          email: reviewer.email,
        },
        assignedPricingTierId,
        disabledVeteranApproved,
        confirmSeniorOverride,
      });
    } catch (error) {
      if (error instanceof ApplicationApprovalError) {
        redirect(`/admin/applications/${params.id}?error=${encodeURIComponent(error.message)}`);
      }
      throw error;
    }

    revalidatePath("/admin/applications");
    revalidatePath(`/admin/applications/${params.id}`);
    revalidatePath("/portal");
    revalidatePath("/apply");
    redirect(`/admin/applications/${params.id}?success=Application%20approved.`);
  }

  async function denyAction(formData: FormData) {
    "use server";

    const reviewer = await requireAdmin(`/admin/applications/${params.id}`);
    const applicationId = String(formData.get("applicationId") ?? "");
    const denialReason = String(formData.get("denialReason") ?? "").trim();

    if (!applicationId || !denialReason) {
      redirect(`/admin/applications/${params.id}?error=Denial%20reason%20is%20required.`);
    }

    try {
      await denyMembershipApplication({
        applicationId,
        reviewer: {
          memberId: reviewer.memberId,
          email: reviewer.email,
        },
        denialReason,
      });
    } catch (error) {
      if (error instanceof ApplicationApprovalError) {
        redirect(`/admin/applications/${params.id}?error=${encodeURIComponent(error.message)}`);
      }
      throw error;
    }

    revalidatePath("/admin/applications");
    revalidatePath(`/admin/applications/${params.id}`);
    revalidatePath("/portal");
    redirect(`/admin/applications/${params.id}?success=Application%20denied.`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Link className="rounded border px-3 py-1.5 text-sm font-medium" href="/admin/applications">
            Back to Applications
          </Link>
        }
        subtitle={`Review and decision workflow for ${application.membershipYear.year}.`}
        title="Application Review"
      />

      {searchParams.success ? (
        <p className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          {searchParams.success}
        </p>
      ) : null}
      {searchParams.error ? (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {searchParams.error}
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-5">
        <article className="rounded-xl border bg-white p-5 shadow-sm lg:col-span-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={toneForStatus(application.status)}>{application.status}</StatusBadge>
            {application.status === "APPROVED" && application.assignedPricingTier ? (
              <StatusBadge tone="info">PAYMENT_AVAILABLE</StatusBadge>
            ) : null}
            {seniorAutoEligible ? <StatusBadge tone="info">Auto: Senior</StatusBadge> : null}
            {application.requestedDisabledVeteranDiscount ? (
              <StatusBadge tone="info">DV Requested</StatusBadge>
            ) : null}
          </div>

          <h2 className="mt-4 text-xl font-semibold">Applicant Details</h2>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <p>
              <span className="font-medium">Name:</span> {application.applicantFirstName}{" "}
              {application.applicantLastName}
            </p>
            <p>
              <span className="font-medium">Email:</span> {application.applicantEmail}
            </p>
            <p>
              <span className="font-medium">Phone:</span> {application.applicantPhone ?? "Not provided"}
            </p>
            <p>
              <span className="font-medium">Address:</span>{" "}
              {formatAddress({
                street1: application.applicantStreet1,
                street2: application.applicantStreet2,
                city: application.applicantCity,
                state: application.applicantState,
                zip: application.applicantZip,
              }) || "Not provided"}
            </p>
            <p>
              <span className="font-medium">DOB:</span>{" "}
              {application.applicantDob ? application.applicantDob.toLocaleDateString() : "Not provided"}
            </p>
            <p>
              <span className="font-medium">Age on Signup Day:</span>{" "}
              {ageOnSignupDay !== null ? ageOnSignupDay : "Unknown"}
            </p>
            <p>
              <span className="font-medium">Signup Day ({application.membershipYear.year}):</span>{" "}
              {signupDay.toLocaleDateString()}
            </p>
            <p>
              <span className="font-medium">Requested Disabled Veteran Discount:</span>{" "}
              {application.requestedDisabledVeteranDiscount ? "Yes" : "No"}
            </p>
            <p className="sm:col-span-2">
              <span className="font-medium">Assigned Tier:</span>{" "}
              {application.assignedPricingTier
                ? `${application.assignedPricingTier.name} (${application.assignedPricingTier.code})`
                : "Not assigned"}
            </p>
            <p className="sm:col-span-2">
              <span className="font-medium">Linked Account:</span>{" "}
              {application.createdMember
                ? `${application.createdMember.email} (${application.createdMember.isActive ? "ACTIVE" : "INACTIVE"})`
                : "No account linked"}
            </p>
          </div>
        </article>

        <aside className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Decision Panel</h2>
            <form action={approveAction} className="mt-4 space-y-4">
              <input name="applicationId" type="hidden" value={application.id} />
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Assigned Pricing Tier</span>
                <select
                  className="w-full rounded border p-2"
                  defaultValue={application.assignedPricingTierId ?? suggestedTier?.id ?? ""}
                  name="assignedPricingTierId"
                  required
                >
                  <option disabled value="">
                    Select tier
                  </option>
                  {tiers.map((tier) => (
                    <option key={tier.id} value={tier.id}>
                      {tier.name} ({tier.code}) - {formatCurrency(tier.amountCents)}
                    </option>
                  ))}
                </select>
              </label>

              {application.requestedDisabledVeteranDiscount ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    defaultChecked={application.disabledVeteranApproved ?? false}
                    name="disabledVeteranApproved"
                    type="checkbox"
                  />
                  Disabled veteran discount approved
                </label>
              ) : null}

              {seniorAutoEligible ? (
                <label className="flex items-center gap-2 text-sm">
                  <input name="confirmSeniorOverride" type="checkbox" />
                  Confirm override when selecting a non-SENIOR tier
                </label>
              ) : null}

              <button
                className="w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
                type="submit"
              >
                Approve Application
              </button>
            </form>
          </section>

          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Deny</h2>
            <form action={denyAction} className="mt-4 space-y-4">
              <input name="applicationId" type="hidden" value={application.id} />
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Denial Reason</span>
                <textarea
                  className="w-full rounded border p-2"
                  defaultValue={application.denialReason ?? ""}
                  name="denialReason"
                  required
                  rows={4}
                />
              </label>
              <button
                className="w-full rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700"
                type="submit"
              >
                Deny Application
              </button>
            </form>
          </section>
        </aside>
      </section>

      {application.reviewedAt ? (
        <section className="rounded-xl border bg-white p-5 text-sm shadow-sm">
          <p>
            Last reviewed on {application.reviewedAt.toLocaleString()}
            {application.reviewedByEmail
              ? ` by ${application.reviewedByEmail}`
              : application.reviewedByMember
              ? ` by ${application.reviewedByMember.name} (${application.reviewedByMember.email})`
              : ""}
            .
          </p>
        </section>
      ) : null}
    </div>
  );
}
