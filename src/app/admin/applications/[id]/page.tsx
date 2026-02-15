import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  calculateAgeOnDate,
  determineSignupDay,
  isSeniorOnDate,
} from "@/lib/membership-dates";
import { createAuditLog } from "@/services/audit";

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

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: SearchParams;
}) {
  const adminUser = await requireAdmin(`/admin/applications/${params.id}`);

  const application = await prisma.membershipApplication.findUnique({
    where: { id: params.id },
    include: {
      member: true,
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
    orderBy: [{ isSenior: "desc" }, { amountCents: "asc" }, { name: "asc" }],
  });

  const tierByCode = new Map(tiers.map((tier) => [tier.code, tier]));

  const signupDay = determineSignupDay({
    year: application.membershipYear.year,
    signupDate: application.membershipYear.signupDate,
  });
  const ageOnSignupDay = application.member.dob
    ? calculateAgeOnDate(application.member.dob, signupDay)
    : null;
  const seniorAutoEligible = isSeniorOnDate(application.member.dob, signupDay);

  const suggestedTier =
    (seniorAutoEligible ? tierByCode.get("SENIOR") : undefined) ??
    (application.requestedDisabledVeteranDiscount ? tierByCode.get("DISABLED_VETERAN") : undefined) ??
    tierByCode.get("STANDARD") ??
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

    const appRecord = await prisma.membershipApplication.findUnique({
      where: { id: applicationId },
      include: {
        member: true,
        membershipYear: true,
      },
    });

    if (!appRecord) {
      redirect(`/admin/applications/${params.id}?error=Application%20not%20found.`);
    }

    const tier = await prisma.pricingTier.findUnique({
      where: { id: assignedPricingTierId },
    });
    if (!tier || !tier.isActive || tier.membershipYearId !== appRecord.membershipYearId) {
      redirect(`/admin/applications/${params.id}?error=Invalid%20pricing%20tier%20selected.`);
    }

    const computedSignupDay = determineSignupDay({
      year: appRecord.membershipYear.year,
      signupDate: appRecord.membershipYear.signupDate,
    });
    const seniorAuto = isSeniorOnDate(appRecord.member.dob, computedSignupDay);
    const isSeniorOverride = seniorAuto && tier.code !== "SENIOR";

    if (isSeniorOverride && !confirmSeniorOverride) {
      redirect(
        `/admin/applications/${params.id}?error=Senior%20auto-pricing%20override%20requires%20confirmation.`
      );
    }

    const disabledVetApprovedValue = appRecord.requestedDisabledVeteranDiscount
      ? disabledVeteranApproved
      : false;

    await prisma.membershipApplication.update({
      where: { id: appRecord.id },
      data: {
        status: "APPROVED",
        assignedPricingTierId: tier.id,
        reviewedAt: new Date(),
        reviewedByMemberId: reviewer.memberId,
        denialReason: null,
        disabledVeteranApproved: disabledVetApprovedValue,
        seniorAutoApplied: seniorAuto,
      },
    });

    await createAuditLog({
      action: "APPLICATION_APPROVED",
      actorMemberId: reviewer.memberId,
      targetMemberId: appRecord.memberId,
      meta: {
        membershipApplicationId: appRecord.id,
        membershipYearId: appRecord.membershipYearId,
        assignedPricingTierId: tier.id,
        assignedPricingTierCode: tier.code,
        disabledVeteranApproved: disabledVetApprovedValue,
        seniorAutoApplied: seniorAuto,
        seniorOverrideApplied: isSeniorOverride,
      },
    });

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

    const appRecord = await prisma.membershipApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        memberId: true,
        membershipYearId: true,
      },
    });

    if (!appRecord) {
      redirect(`/admin/applications/${params.id}?error=Application%20not%20found.`);
    }

    await prisma.membershipApplication.update({
      where: { id: appRecord.id },
      data: {
        status: "DENIED",
        denialReason,
        reviewedAt: new Date(),
        reviewedByMemberId: reviewer.memberId,
        assignedPricingTierId: null,
        disabledVeteranApproved: false,
      },
    });

    await createAuditLog({
      action: "APPLICATION_DENIED",
      actorMemberId: reviewer.memberId,
      targetMemberId: appRecord.memberId,
      meta: {
        membershipApplicationId: appRecord.id,
        membershipYearId: appRecord.membershipYearId,
        denialReason,
      },
    });

    revalidatePath("/admin/applications");
    revalidatePath(`/admin/applications/${params.id}`);
    revalidatePath("/portal");
    redirect(`/admin/applications/${params.id}?success=Application%20denied.`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Application Review</h1>
        <Link className="text-sm font-medium underline" href="/admin/applications">
          Back to applications
        </Link>
      </div>

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

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Applicant</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="font-medium">Name:</span> {application.member.name}
          </p>
          <p>
            <span className="font-medium">Email:</span> {application.member.email}
          </p>
          <p>
            <span className="font-medium">DOB:</span>{" "}
            {application.member.dob ? application.member.dob.toLocaleDateString() : "Not provided"}
          </p>
          <p>
            <span className="font-medium">Age on signup day:</span>{" "}
            {ageOnSignupDay !== null ? ageOnSignupDay : "Unknown"}
          </p>
          <p>
            <span className="font-medium">Signup day ({application.membershipYear.year}):</span>{" "}
            {signupDay.toLocaleDateString()}
          </p>
          <p>
            <span className="font-medium">Senior auto flag:</span>{" "}
            {seniorAutoEligible ? "Yes" : "No"}
          </p>
          <p>
            <span className="font-medium">Requested disabled veteran discount:</span>{" "}
            {application.requestedDisabledVeteranDiscount ? "Yes" : "No"}
          </p>
          <p>
            <span className="font-medium">Current status:</span> {application.status}
          </p>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Approve</h2>
        <form action={approveAction} className="mt-4 space-y-4">
          <input name="applicationId" type="hidden" value={application.id} />
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Assigned pricing tier</span>
            <select
              className="w-full rounded border p-2 sm:max-w-sm"
              defaultValue={application.assignedPricingTierId ?? suggestedTier?.id ?? ""}
              name="assignedPricingTierId"
              required
            >
              <option value="" disabled>
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
              Confirm override if selecting a non-SENIOR tier for a 65+ applicant
            </label>
          ) : null}

          <button
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            type="submit"
          >
            Approve Application
          </button>
        </form>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Deny</h2>
        <form action={denyAction} className="mt-4 space-y-4">
          <input name="applicationId" type="hidden" value={application.id} />
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Denial reason</span>
            <textarea
              className="w-full rounded border p-2"
              defaultValue={application.denialReason ?? ""}
              name="denialReason"
              required
              rows={4}
            />
          </label>
          <button
            className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700"
            type="submit"
          >
            Deny Application
          </button>
        </form>
      </section>

      {application.reviewedAt ? (
        <section className="rounded-xl border bg-white p-5 text-sm shadow-sm">
          <p>
            Last reviewed on {application.reviewedAt.toLocaleString()}
            {application.reviewedByMember
              ? ` by ${application.reviewedByMember.name} (${application.reviewedByMember.email})`
              : ""}
            .
          </p>
        </section>
      ) : null}
    </div>
  );
}
