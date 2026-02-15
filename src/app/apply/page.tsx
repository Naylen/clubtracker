import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentYearInNewYork } from "@/lib/membership-dates";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

type SearchParams = {
  success?: string;
  error?: string;
};

function parseDateInput(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export default async function ApplyPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireCurrentUser("/apply");
  const currentYear = getCurrentYearInNewYork();

  if (user.role !== "MEMBER") {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Membership Application</h1>
          <p className="mt-2 text-sm text-gray-700">
            Only member accounts can submit applications.
          </p>
        </section>
      </main>
    );
  }

  const [member, membershipYear] = await Promise.all([
    prisma.member.findUnique({ where: { id: user.memberId } }),
    prisma.membershipYear.findUnique({ where: { year: currentYear } }),
  ]);

  const application = membershipYear
    ? await prisma.membershipApplication.findUnique({
        where: {
          memberId_membershipYearId: {
            memberId: user.memberId,
            membershipYearId: membershipYear.id,
          },
        },
        include: {
          assignedPricingTier: true,
        },
      })
    : null;

  async function submitApplicationAction(formData: FormData) {
    "use server";

    const authUser = await requireCurrentUser("/apply");
    if (authUser.role !== "MEMBER") {
      redirect("/forbidden");
    }

    const year = getCurrentYearInNewYork();
    const currentYearRecord = await prisma.membershipYear.findUnique({
      where: { year },
    });

    if (!currentYearRecord || !currentYearRecord.applicationEnabled) {
      redirect("/apply?error=Applications%20are%20currently%20closed.");
    }

    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const address = String(formData.get("address") ?? "").trim() || null;
    const dobInput = String(formData.get("dob") ?? "");
    const dob = parseDateInput(dobInput);
    const requestedDisabledVeteranDiscount =
      formData.get("requestedDisabledVeteranDiscount") === "on";

    if (!name) {
      redirect("/apply?error=Full%20name%20is%20required.");
    }

    if (!dob) {
      redirect("/apply?error=Valid%20date%20of%20birth%20is%20required.");
    }

    await prisma.member.update({
      where: { id: authUser.memberId },
      data: {
        name,
        phone,
        address,
        dob,
      },
    });

    await prisma.membershipApplication.upsert({
      where: {
        memberId_membershipYearId: {
          memberId: authUser.memberId,
          membershipYearId: currentYearRecord.id,
        },
      },
      update: {
        status: "SUBMITTED",
        requestedDisabledVeteranDiscount,
        disabledVeteranApproved: null,
        assignedPricingTierId: null,
        submittedAt: new Date(),
        reviewedAt: null,
        reviewedByMemberId: null,
        denialReason: null,
      },
      create: {
        memberId: authUser.memberId,
        membershipYearId: currentYearRecord.id,
        status: "SUBMITTED",
        requestedDisabledVeteranDiscount,
        disabledVeteranApproved: null,
        seniorAutoApplied: false,
        submittedAt: new Date(),
      },
    });

    revalidatePath("/apply");
    revalidatePath("/portal");
    revalidatePath("/admin/applications");
    redirect("/apply?success=Application%20submitted%20for%20review.");
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Membership Application</h1>
        <Link className="text-sm font-medium underline" href="/portal">
          Back to portal
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

      {!membershipYear || !membershipYear.applicationEnabled ? (
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Applications are currently closed.</h2>
          <p className="mt-2 text-sm text-gray-600">
            Applications for {currentYear} are locked until an administrator opens them.
          </p>
          {application ? (
            <p className="mt-3 text-sm">
              Existing application status: <span className="font-medium">{application.status}</span>
            </p>
          ) : null}
        </section>
      ) : application?.status === "APPROVED" ? (
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Application Approved</h2>
          <p className="mt-2 text-sm text-gray-700">
            Your application for {currentYear} is approved.
            {application.assignedPricingTier
              ? ` Assigned tier: ${application.assignedPricingTier.name}.`
              : ""}
          </p>
          <p className="mt-2 text-sm text-gray-600">
            Return to the member portal to continue with payment.
          </p>
        </section>
      ) : (
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Submit Application ({currentYear})</h2>
          <p className="mt-2 text-sm text-gray-600">
            Applications are reviewed by admin before payment is unlocked.
          </p>

          <form action={submitApplicationAction} className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">
              Full Name
              <input
                className="mt-1 w-full rounded border p-2"
                defaultValue={member?.name ?? ""}
                name="name"
                required
              />
            </label>

            <label className="text-sm font-medium">
              Phone
              <input
                className="mt-1 w-full rounded border p-2"
                defaultValue={member?.phone ?? ""}
                name="phone"
              />
            </label>

            <label className="text-sm font-medium">
              Date of Birth
              <input
                className="mt-1 w-full rounded border p-2"
                defaultValue={member?.dob ? member.dob.toISOString().slice(0, 10) : ""}
                name="dob"
                required
                type="date"
              />
            </label>

            <label className="text-sm font-medium sm:col-span-2">
              Address
              <input
                className="mt-1 w-full rounded border p-2"
                defaultValue={member?.address ?? ""}
                name="address"
              />
            </label>

            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                defaultChecked={application?.requestedDisabledVeteranDiscount ?? false}
                name="requestedDisabledVeteranDiscount"
                type="checkbox"
              />
              Request disabled veteran discount (admin approval required)
            </label>

            <div className="sm:col-span-2">
              <button
                className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
                type="submit"
              >
                Submit Application
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
