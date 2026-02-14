import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isSeniorFromDob } from "@/lib/membership-dates";
import { hashPassword } from "@/lib/password";

function parseDateInput(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  return new Date(`${raw}T00:00:00Z`);
}

export default async function AdminMembersPage() {
  await requireAdmin("/admin/members");

  async function createMemberAction(formData: FormData) {
    "use server";

    await requireAdmin("/admin/members");

    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const address = String(formData.get("address") ?? "").trim() || null;
    const dob = parseDateInput(formData.get("dob"));
    const isDisabledVeteran = formData.get("isDisabledVeteran") === "on";

    if (!name || !email || !password) {
      throw new Error("Name, email, and password are required.");
    }

    await prisma.member.create({
      data: {
        name,
        email,
        passwordHash: hashPassword(password),
        phone,
        address,
        dob,
        isDisabledVeteran,
        isSenior: isSeniorFromDob(dob),
        isActive: true,
        role: "MEMBER",
      },
    });

    revalidatePath("/admin/members");
    revalidatePath("/admin");
  }

  async function updateMemberAction(formData: FormData) {
    "use server";

    await requireAdmin("/admin/members");

    const memberId = String(formData.get("memberId") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const address = String(formData.get("address") ?? "").trim() || null;
    const dob = parseDateInput(formData.get("dob"));
    const isDisabledVeteran = formData.get("isDisabledVeteran") === "on";

    if (!memberId || !name || !email) {
      throw new Error("Member ID, name, and email are required.");
    }

    await prisma.member.update({
      where: { id: memberId },
      data: {
        name,
        email,
        phone,
        address,
        dob,
        isDisabledVeteran,
        isSenior: isSeniorFromDob(dob),
        ...(password ? { passwordHash: hashPassword(password) } : {}),
      },
    });

    revalidatePath("/admin/members");
    revalidatePath("/admin");
  }

  async function deactivateMemberAction(formData: FormData) {
    "use server";

    await requireAdmin("/admin/members");

    const memberId = String(formData.get("memberId") ?? "");
    if (!memberId) {
      throw new Error("Member ID is required.");
    }

    await prisma.member.update({
      where: { id: memberId },
      data: { isActive: false },
    });

    revalidatePath("/admin/members");
    revalidatePath("/admin");
  }

  const members = await prisma.member.findMany({
    where: { role: "MEMBER" },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-8">
      <section className="rounded border bg-white p-6">
        <h1 className="mb-4 text-2xl font-bold">Member Roster</h1>
        <form action={createMemberAction} className="grid gap-3 sm:grid-cols-2">
          <input className="rounded border p-2" name="name" placeholder="Full name" required />
          <input
            className="rounded border p-2"
            name="email"
            placeholder="Email"
            type="email"
            required
          />
          <input
            className="rounded border p-2"
            name="password"
            placeholder="Temporary password"
            type="password"
            required
          />
          <input className="rounded border p-2" name="phone" placeholder="Phone (optional)" />
          <input className="rounded border p-2" name="address" placeholder="Address (optional)" />
          <input className="rounded border p-2" name="dob" type="date" />
          <label className="flex items-center gap-2 text-sm">
            <input name="isDisabledVeteran" type="checkbox" /> Disabled veteran
          </label>
          <div>
            <button className="rounded bg-gray-900 px-4 py-2 text-sm text-white" type="submit">
              Add Member
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        {members.map((member) => (
          <article className="rounded border bg-white p-4" key={member.id}>
            <form action={updateMemberAction} className="grid gap-3 sm:grid-cols-2">
              <input name="memberId" type="hidden" value={member.id} />

              <input className="rounded border p-2" defaultValue={member.name} name="name" required />
              <input
                className="rounded border p-2"
                defaultValue={member.email}
                name="email"
                type="email"
                required
              />
              <input
                className="rounded border p-2"
                name="password"
                placeholder="New password (optional)"
                type="password"
              />
              <input
                className="rounded border p-2"
                defaultValue={member.phone ?? ""}
                name="phone"
                placeholder="Phone"
              />
              <input
                className="rounded border p-2"
                defaultValue={member.address ?? ""}
                name="address"
                placeholder="Address"
              />
              <input
                className="rounded border p-2"
                defaultValue={member.dob ? member.dob.toISOString().slice(0, 10) : ""}
                name="dob"
                type="date"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  defaultChecked={member.isDisabledVeteran}
                  name="isDisabledVeteran"
                  type="checkbox"
                />
                Disabled veteran
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input defaultChecked={member.isActive} disabled type="checkbox" />
                Active
              </label>

              <div className="flex gap-2">
                <button className="rounded border px-3 py-2 text-sm" type="submit">
                  Save
                </button>
              </div>
            </form>

            <form action={deactivateMemberAction} className="mt-3">
              <input name="memberId" type="hidden" value={member.id} />
              <button
                className="rounded border border-red-300 px-3 py-2 text-sm text-red-700"
                type="submit"
              >
                Deactivate
              </button>
            </form>
          </article>
        ))}
      </section>
    </div>
  );
}
