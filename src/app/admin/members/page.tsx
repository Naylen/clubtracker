import Link from "next/link";
import { revalidatePath } from "next/cache";
import type { MemberDiscipline } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MEMBER_DISCIPLINE_OPTIONS, parseDisciplineInterests } from "@/lib/discipline";
import { secureDlNumber } from "@/lib/dl-security";
import { isSeniorFromDob } from "@/lib/membership-dates";
import { hashPassword } from "@/lib/password";
import { createAuditLog } from "@/services/audit";
import { RevealDlButton } from "./reveal-dl-button";

function parseDateInput(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  return new Date(`${raw}T00:00:00Z`);
}

function disciplineLabel(value: MemberDiscipline): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export default async function AdminMembersPage() {
  await requireAdmin("/admin/members");

  async function createMemberAction(formData: FormData) {
    "use server";

    const adminUser = await requireAdmin("/admin/members");

    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const address = String(formData.get("address") ?? "").trim() || null;
    const dob = parseDateInput(formData.get("dob"));
    const isDisabledVeteran = formData.get("isDisabledVeteran") === "on";
    const isActive = formData.get("isActive") === "on";
    const emergencyContactName = String(formData.get("emergencyContactName") ?? "").trim() || null;
    const emergencyContactPhone = String(formData.get("emergencyContactPhone") ?? "").trim() || null;
    const emergencyContactRelationship =
      String(formData.get("emergencyContactRelationship") ?? "").trim() || null;
    const disciplineInterests = parseDisciplineInterests(formData.getAll("disciplineInterests"));
    const dlNumberInput = String(formData.get("dlNumber") ?? "").trim();
    const secureDlFields = dlNumberInput ? secureDlNumber(dlNumberInput) : null;

    if (!name || !email || !password) {
      throw new Error("Name, email, and password are required.");
    }

    const member = await prisma.member.create({
      data: {
        name,
        email,
        passwordHash: hashPassword(password),
        phone,
        address,
        dob,
        isDisabledVeteran,
        isSenior: isSeniorFromDob(dob),
        isActive,
        emergencyContactName,
        emergencyContactPhone,
        emergencyContactRelationship,
        disciplineInterests,
        ...(secureDlFields ?? {}),
        role: "MEMBER",
      },
    });

    if (secureDlFields) {
      await createAuditLog({
        action: "MEMBER_DL_UPDATED",
        actorMemberId: adminUser.memberId,
        targetMemberId: member.id,
        meta: {
          via: "admin.members.create.form",
        },
      });
    }

    revalidatePath("/admin/members");
    revalidatePath("/admin");
  }

  async function updateMemberAction(formData: FormData) {
    "use server";

    const adminUser = await requireAdmin("/admin/members");

    const memberId = String(formData.get("memberId") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const address = String(formData.get("address") ?? "").trim() || null;
    const dob = parseDateInput(formData.get("dob"));
    const isDisabledVeteran = formData.get("isDisabledVeteran") === "on";
    const isActive = formData.get("isActive") === "on";
    const emergencyContactName = String(formData.get("emergencyContactName") ?? "").trim() || null;
    const emergencyContactPhone = String(formData.get("emergencyContactPhone") ?? "").trim() || null;
    const emergencyContactRelationship =
      String(formData.get("emergencyContactRelationship") ?? "").trim() || null;
    const disciplineInterests = parseDisciplineInterests(formData.getAll("disciplineInterests"));
    const dlNumberInput = String(formData.get("dlNumber") ?? "").trim();
    const secureDlFields = dlNumberInput ? secureDlNumber(dlNumberInput) : null;

    if (!memberId || !name || !email) {
      throw new Error("Member ID, name, and email are required.");
    }

    const member = await prisma.member.update({
      where: { id: memberId },
      data: {
        name,
        email,
        phone,
        address,
        dob,
        isDisabledVeteran,
        isSenior: isSeniorFromDob(dob),
        isActive,
        emergencyContactName,
        emergencyContactPhone,
        emergencyContactRelationship,
        disciplineInterests,
        ...(password ? { passwordHash: hashPassword(password) } : {}),
        ...(secureDlFields ?? {}),
      },
    });

    if (secureDlFields) {
      await createAuditLog({
        action: "MEMBER_DL_UPDATED",
        actorMemberId: adminUser.memberId,
        targetMemberId: member.id,
        meta: {
          via: "admin.members.update.form",
        },
      });
    }

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
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Member Roster</h1>
          <Link className="text-sm font-medium underline" href="/admin/members/import">
            Import from CSV
          </Link>
        </div>

        <form action={createMemberAction} className="grid gap-3 md:grid-cols-2">
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
          <input
            className="rounded border p-2"
            name="emergencyContactName"
            placeholder="Emergency contact name"
          />
          <input
            className="rounded border p-2"
            name="emergencyContactPhone"
            placeholder="Emergency contact phone"
          />
          <input
            className="rounded border p-2"
            name="emergencyContactRelationship"
            placeholder="Emergency contact relationship"
          />
          <input
            className="rounded border p-2"
            name="dlNumber"
            placeholder="Driver license (stored encrypted)"
            type="text"
          />

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input defaultChecked name="isActive" type="checkbox" />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input name="isDisabledVeteran" type="checkbox" />
              Disabled veteran
            </label>
          </div>

          <div className="md:col-span-2">
            <p className="mb-2 text-sm font-medium">Discipline interests</p>
            <div className="flex flex-wrap gap-4">
              {MEMBER_DISCIPLINE_OPTIONS.map((discipline) => (
                <label className="flex items-center gap-2 text-sm" key={discipline}>
                  <input name="disciplineInterests" type="checkbox" value={discipline} />
                  {disciplineLabel(discipline)}
                </label>
              ))}
            </div>
          </div>

          <div>
            <button className="rounded bg-gray-900 px-4 py-2 text-sm text-white" type="submit">
              Add Member
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        {members.map((member) => (
          <article className="rounded-xl border bg-white p-4 shadow-sm" key={member.id}>
            <form action={updateMemberAction} className="grid gap-3 md:grid-cols-2">
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
              <input
                className="rounded border p-2"
                defaultValue={member.emergencyContactName ?? ""}
                name="emergencyContactName"
                placeholder="Emergency contact name"
              />
              <input
                className="rounded border p-2"
                defaultValue={member.emergencyContactPhone ?? ""}
                name="emergencyContactPhone"
                placeholder="Emergency contact phone"
              />
              <input
                className="rounded border p-2"
                defaultValue={member.emergencyContactRelationship ?? ""}
                name="emergencyContactRelationship"
                placeholder="Emergency contact relationship"
              />
              <input
                className="rounded border p-2"
                name="dlNumber"
                placeholder="Set/replace driver license"
                type="text"
              />

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    defaultChecked={member.isDisabledVeteran}
                    name="isDisabledVeteran"
                    type="checkbox"
                  />
                  Disabled veteran
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input defaultChecked={member.isActive} name="isActive" type="checkbox" />
                  Active
                </label>
              </div>

              <div className="md:col-span-2">
                <p className="mb-2 text-sm font-medium">Discipline interests</p>
                <div className="flex flex-wrap gap-4">
                  {MEMBER_DISCIPLINE_OPTIONS.map((discipline) => (
                    <label className="flex items-center gap-2 text-sm" key={discipline}>
                      <input
                        defaultChecked={member.disciplineInterests.includes(discipline)}
                        name="disciplineInterests"
                        type="checkbox"
                        value={discipline}
                      />
                      {disciplineLabel(discipline)}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <button className="rounded border px-3 py-2 text-sm" type="submit">
                  Save
                </button>
                <RevealDlButton memberId={member.id} />
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
