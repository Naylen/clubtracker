import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createSessionToken,
  getCurrentUser,
  requireCurrentUser,
  setSessionCookie,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ApplicationFlowError,
  createApplicantAccountAndSubmit,
  getCurrentOpenApplicationYear,
  submitApplicationForExistingAccount,
} from "@/services/application-flow";

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

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

async function getOpenApplicationYear() {
  try {
    return await getCurrentOpenApplicationYear();
  } catch (error) {
    if (error instanceof ApplicationFlowError && error.code === "APPLICATIONS_CLOSED") {
      notFound();
    }
    throw error;
  }
}

export default async function ApplyPage({ searchParams }: { searchParams: SearchParams }) {
  const membershipYear = await getOpenApplicationYear();
  const currentUser = await getCurrentUser();

  if (currentUser?.role === "ADMIN") {
    redirect("/admin");
  }

  const member = currentUser
    ? await prisma.member.findUnique({
        where: { id: currentUser.memberId },
      })
    : null;

  const activeEnrollmentCount =
    member?.id
      ? await prisma.membershipEnrollment.count({
          where: {
            memberId: member.id,
            status: "ACTIVE",
          },
        })
      : 0;

  if (member && activeEnrollmentCount > 0) {
    redirect("/portal");
  }

  const application = member
    ? await prisma.membershipApplication.findUnique({
        where: {
          membershipYearId_applicantEmail: {
            membershipYearId: membershipYear.id,
            applicantEmail: member.email,
          },
        },
        include: {
          assignedPricingTier: true,
        },
      })
    : null;

  async function createAccountAndSubmitAction(formData: FormData) {
    "use server";

    const openYear = await getOpenApplicationYear();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const address = String(formData.get("address") ?? "").trim() || null;
    const dob = parseDateInput(String(formData.get("dob") ?? ""));
    const requestedDisabledVeteranDiscount =
      formData.get("requestedDisabledVeteranDiscount") === "on";

    if (!email || !password || !firstName || !lastName || !dob) {
      redirect("/apply?error=Email%2C%20password%2C%20name%2C%20and%20DOB%20are%20required.");
    }

    try {
      const { member: createdMember } = await createApplicantAccountAndSubmit({
        membershipYearId: openYear.id,
        email,
        password,
        firstName,
        lastName,
        phone,
        address,
        dob,
        requestedDisabledVeteranDiscount,
      });

      const token = createSessionToken({
        memberId: createdMember.id,
        email: createdMember.email,
        role: createdMember.role,
      });
      setSessionCookie(token);
    } catch (error) {
      if (error instanceof ApplicationFlowError) {
        if (error.code === "ACTIVE_MEMBER_EXISTS") {
          redirect(
            "/login?next=%2Fportal&error=This%20email%20already%20belongs%20to%20an%20active%20member."
          );
        }
        if (error.code === "ACCOUNT_EXISTS") {
          redirect("/login?next=%2Fapply&error=Account%20already%20exists.%20Please%20sign%20in.");
        }
      }
      throw error;
    }

    revalidatePath("/apply");
    revalidatePath("/portal");
    revalidatePath("/admin/applications");
    redirect("/apply?success=Application%20submitted%20for%20review.");
  }

  async function updateApplicationAction(formData: FormData) {
    "use server";

    const authUser = await requireCurrentUser("/apply");
    if (authUser.role !== "MEMBER") {
      redirect("/forbidden");
    }

    const openYear = await getOpenApplicationYear();
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const address = String(formData.get("address") ?? "").trim() || null;
    const dob = parseDateInput(String(formData.get("dob") ?? ""));
    const requestedDisabledVeteranDiscount =
      formData.get("requestedDisabledVeteranDiscount") === "on";

    if (!firstName || !lastName || !dob) {
      redirect("/apply?error=Name%20and%20DOB%20are%20required.");
    }

    try {
      await submitApplicationForExistingAccount({
        membershipYearId: openYear.id,
        memberId: authUser.memberId,
        email: authUser.email,
        firstName,
        lastName,
        phone,
        address,
        dob,
        requestedDisabledVeteranDiscount,
      });
    } catch (error) {
      if (error instanceof ApplicationFlowError) {
        if (error.code === "ACTIVE_MEMBER_EXISTS") {
          redirect("/portal");
        }
        if (error.code === "ACCOUNT_NOT_FOUND") {
          redirect("/login?next=%2Fapply&error=Account%20not%20found.");
        }
      }
      throw error;
    }

    revalidatePath("/apply");
    revalidatePath("/portal");
    revalidatePath("/admin/applications");
    redirect("/apply?success=Application%20submitted%20for%20review.");
  }

  const name = splitName(member?.name ?? "");

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">New Member Application</h1>
        {member ? (
          <Link className="text-sm font-medium underline" href="/portal">
            Back to portal
          </Link>
        ) : null}
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

      {application ? (
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Application Status</h2>
          <p className="mt-2 text-sm">
            Current status: <span className="font-medium">{application.status}</span>
          </p>
          {application.status === "APPROVED" && application.assignedPricingTier ? (
            <p className="mt-2 text-sm text-gray-700">
              Assigned tier: {application.assignedPricingTier.name}. Payment is available in your
              member portal.
            </p>
          ) : null}
          {application.status === "DENIED" && application.denialReason ? (
            <p className="mt-2 text-sm text-red-700">Denial reason: {application.denialReason}</p>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">
          {member ? "Submit or Update Application" : "Create Account and Apply"}
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Applicants cannot choose pricing tiers. Admin assigns tier after review.
        </p>

        <form
          action={member ? updateApplicationAction : createAccountAndSubmitAction}
          className="mt-5 grid gap-3 sm:grid-cols-2"
        >
          {!member ? (
            <>
              <label className="text-sm font-medium sm:col-span-2">
                Email
                <input className="mt-1 w-full rounded border p-2" name="email" required type="email" />
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                Password
                <input
                  className="mt-1 w-full rounded border p-2"
                  minLength={8}
                  name="password"
                  required
                  type="password"
                />
              </label>
            </>
          ) : null}

          <label className="text-sm font-medium">
            First Name
            <input
              className="mt-1 w-full rounded border p-2"
              defaultValue={application?.applicantFirstName ?? name.firstName}
              name="firstName"
              required
            />
          </label>

          <label className="text-sm font-medium">
            Last Name
            <input
              className="mt-1 w-full rounded border p-2"
              defaultValue={application?.applicantLastName ?? name.lastName}
              name="lastName"
              required
            />
          </label>

          <label className="text-sm font-medium">
            Phone
            <input
              className="mt-1 w-full rounded border p-2"
              defaultValue={application?.applicantPhone ?? member?.phone ?? ""}
              name="phone"
            />
          </label>

          <label className="text-sm font-medium">
            Date of Birth
            <input
              className="mt-1 w-full rounded border p-2"
              defaultValue={
                application?.applicantDob
                  ? application.applicantDob.toISOString().slice(0, 10)
                  : member?.dob
                    ? member.dob.toISOString().slice(0, 10)
                    : ""
              }
              name="dob"
              required
              type="date"
            />
          </label>

          <label className="text-sm font-medium sm:col-span-2">
            Address
            <input
              className="mt-1 w-full rounded border p-2"
              defaultValue={application?.applicantAddress ?? member?.address ?? ""}
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
    </main>
  );
}