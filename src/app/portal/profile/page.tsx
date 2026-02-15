import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MEMBER_DISCIPLINE_OPTIONS, parseDisciplineInterests } from "@/lib/discipline";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";

function parseDateInput(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function labelForDiscipline(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

type SearchParams = {
  saved?: string;
  error?: string;
};

export default async function MemberProfilePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireCurrentUser("/portal/profile");
  const member = await prisma.member.findUnique({
    where: { id: user.memberId },
  });

  if (!member) {
    redirect("/login?next=%2Fportal%2Fprofile");
  }

  async function saveProfileAction(formData: FormData) {
    "use server";

    const authUser = await requireCurrentUser("/portal/profile");
    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const address = String(formData.get("address") ?? "").trim() || null;
    const dob = parseDateInput(formData.get("dob"));
    const emergencyContactName = String(formData.get("emergencyContactName") ?? "").trim() || null;
    const emergencyContactRelationship =
      String(formData.get("emergencyContactRelationship") ?? "").trim() || null;
    const emergencyContactPhone = String(formData.get("emergencyContactPhone") ?? "").trim() || null;
    const disciplineInterests = parseDisciplineInterests(formData.getAll("disciplineInterests"));

    if (!name) {
      redirect("/portal/profile?error=Name%20is%20required");
    }

    await prisma.member.update({
      where: { id: authUser.memberId },
      data: {
        name,
        phone,
        address,
        dob,
        emergencyContactName,
        emergencyContactRelationship,
        emergencyContactPhone,
        disciplineInterests,
      },
    });

    revalidatePath("/portal");
    revalidatePath("/portal/profile");
    revalidatePath("/portal/status");
    redirect("/portal/profile?saved=1");
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader subtitle="Update your personal and emergency contact information." title="My Profile" />

      {searchParams.saved ? (
        <p className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          Profile saved.
        </p>
      ) : null}
      {searchParams.error ? (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {searchParams.error}
        </p>
      ) : null}

      <form action={saveProfileAction} className="space-y-6 rounded-xl border bg-white p-6 shadow-sm">
        <section className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">
            Name
            <input className="mt-1 w-full rounded border p-2" defaultValue={member.name} name="name" required />
          </label>
          <label className="text-sm font-medium">
            Email (read-only)
            <input
              className="mt-1 w-full rounded border bg-gray-50 p-2 text-gray-500"
              defaultValue={member.email}
              disabled
            />
          </label>
          <label className="text-sm font-medium">
            Date of Birth
            <input
              className="mt-1 w-full rounded border p-2"
              defaultValue={member.dob ? member.dob.toISOString().slice(0, 10) : ""}
              name="dob"
              type="date"
            />
          </label>
          <label className="text-sm font-medium">
            Phone
            <input className="mt-1 w-full rounded border p-2" defaultValue={member.phone ?? ""} name="phone" />
          </label>
          <label className="text-sm font-medium">
            Address
            <input className="mt-1 w-full rounded border p-2" defaultValue={member.address ?? ""} name="address" />
          </label>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <h2 className="text-base font-semibold sm:col-span-3">Emergency Contact</h2>
          <label className="text-sm font-medium">
            Name
            <input
              className="mt-1 w-full rounded border p-2"
              defaultValue={member.emergencyContactName ?? ""}
              name="emergencyContactName"
            />
          </label>
          <label className="text-sm font-medium">
            Relationship
            <input
              className="mt-1 w-full rounded border p-2"
              defaultValue={member.emergencyContactRelationship ?? ""}
              name="emergencyContactRelationship"
            />
          </label>
          <label className="text-sm font-medium">
            Phone
            <input
              className="mt-1 w-full rounded border p-2"
              defaultValue={member.emergencyContactPhone ?? ""}
              name="emergencyContactPhone"
            />
          </label>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Disciplines</h2>
          <div className="grid gap-2 sm:grid-cols-4">
            {MEMBER_DISCIPLINE_OPTIONS.map((discipline) => (
              <label className="flex items-center gap-2 text-sm" key={discipline}>
                <input
                  defaultChecked={member.disciplineInterests.includes(discipline)}
                  name="disciplineInterests"
                  type="checkbox"
                  value={discipline}
                />
                {labelForDiscipline(discipline)}
              </label>
            ))}
          </div>
        </section>

        <button className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white" type="submit">
          Save Profile
        </button>
      </form>
    </main>
  );
}
