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
import { MEMBER_DISCIPLINE_OPTIONS } from "@/lib/discipline";
import {
  ApplicationFlowError,
  createApplicantAccountAndSubmit,
  getCurrentOpenApplicationYear,
  submitApplicationForExistingAccount,
} from "@/services/application-flow";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

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

function labelForDiscipline(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
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
    const emergencyContactName = String(formData.get("emergencyContactName") ?? "").trim() || null;
    const emergencyContactRelationship =
      String(formData.get("emergencyContactRelationship") ?? "").trim() || null;
    const emergencyContactPhone = String(formData.get("emergencyContactPhone") ?? "").trim() || null;
    const disciplineInterests = formData.getAll("disciplineInterests").map((value) => String(value));
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
        emergencyContactName,
        emergencyContactRelationship,
        emergencyContactPhone,
        disciplineInterests,
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
    const emergencyContactName = String(formData.get("emergencyContactName") ?? "").trim() || null;
    const emergencyContactRelationship =
      String(formData.get("emergencyContactRelationship") ?? "").trim() || null;
    const emergencyContactPhone = String(formData.get("emergencyContactPhone") ?? "").trim() || null;
    const disciplineInterests = formData.getAll("disciplineInterests").map((value) => String(value));
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
        emergencyContactName,
        emergencyContactRelationship,
        emergencyContactPhone,
        disciplineInterests,
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
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        subtitle={`Membership Year ${membershipYear.year}. Public applications are open.`}
        title="New Member Application"
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

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">How This Works</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-gray-700">
          <li>Create applicant account (or sign in if already created).</li>
          <li>Submit application details.</li>
          <li>Await admin approval before payment is available.</li>
        </ol>
        {!member ? (
          <p className="mt-3 text-sm text-gray-600">
            Already created an account? <Link className="underline" href="/login?next=%2Fapply">Sign in to continue your application.</Link>
          </p>
        ) : null}
      </section>

      {application ? (
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Current Application Status</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <StatusBadge tone={application.status === "APPROVED" ? "success" : application.status === "DENIED" ? "danger" : "info"}>
              {application.status}
            </StatusBadge>
            {application.status === "APPROVED" ? (
              <StatusBadge tone="info">PAYMENT_AVAILABLE</StatusBadge>
            ) : null}
          </div>
          {application.status === "APPROVED" && application.assignedPricingTier ? (
            <p className="mt-3 text-sm text-gray-700">
              Assigned tier: {application.assignedPricingTier.name}. You can pay from your portal.
            </p>
          ) : null}
          {application.status === "DENIED" && application.denialReason ? (
            <p className="mt-3 text-sm text-red-700">Denial reason: {application.denialReason}</p>
          ) : null}
        </section>
      ) : null}

      <form
        action={member ? updateApplicationAction : createAccountAndSubmitAction}
        className="space-y-6"
      >
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Step 1: Applicant Account</h2>
          {!member ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-700">Signed in as {member.email}. Continue to application details below.</p>
          )}
        </section>

        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Step 2: Application Details</h2>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                defaultValue={member?.phone ?? ""}
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
              <input className="mt-1 w-full rounded border p-2" defaultValue={member?.address ?? ""} name="address" />
            </label>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <h3 className="text-base font-semibold sm:col-span-3">Emergency Contact</h3>
            <label className="text-sm font-medium">
              Name
              <input
                className="mt-1 w-full rounded border p-2"
                defaultValue={member?.emergencyContactName ?? ""}
                name="emergencyContactName"
              />
            </label>
            <label className="text-sm font-medium">
              Relationship
              <input
                className="mt-1 w-full rounded border p-2"
                defaultValue={member?.emergencyContactRelationship ?? ""}
                name="emergencyContactRelationship"
              />
            </label>
            <label className="text-sm font-medium">
              Phone
              <input
                className="mt-1 w-full rounded border p-2"
                defaultValue={member?.emergencyContactPhone ?? ""}
                name="emergencyContactPhone"
              />
            </label>
          </div>

          <div className="mt-6 space-y-2">
            <h3 className="text-base font-semibold">Disciplines</h3>
            <p className="text-xs text-gray-500">Select all interests: Archery, Pistol, Rifle, Trap.</p>
            <div className="grid gap-2 sm:grid-cols-4">
              {MEMBER_DISCIPLINE_OPTIONS.map((discipline) => (
                <label className="flex items-center gap-2 text-sm" key={discipline}>
                  <input
                    defaultChecked={member?.disciplineInterests.includes(discipline)}
                    name="disciplineInterests"
                    type="checkbox"
                    value={discipline}
                  />
                  {labelForDiscipline(discipline)}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <h3 className="text-base font-semibold">Discount Request</h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                defaultChecked={application?.requestedDisabledVeteranDiscount ?? false}
                name="requestedDisabledVeteranDiscount"
                type="checkbox"
              />
              Request Disabled Veteran Discount (admin approval required)
            </label>
          </div>
        </section>

        <button className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white" type="submit">
          Submit Application
        </button>
      </form>
    </main>
  );
}
