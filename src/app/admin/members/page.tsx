import Link from "next/link";
import { revalidatePath } from "next/cache";
import type { MemberDiscipline } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatCityState, validateStructuredAddress } from "@/lib/address";
import { MEMBER_DISCIPLINE_OPTIONS, parseDisciplineInterests } from "@/lib/discipline";
import { secureDlNumber } from "@/lib/dl-security";
import { isSeniorFromDob } from "@/lib/membership-dates";
import { hashPassword } from "@/lib/password";
import { PageShell } from "@/components/ui/page-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { createAuditLog } from "@/services/audit";
import { RevealDlButton } from "./reveal-dl-button";

type SearchParams = {
  q?: string;
  active?: string;
  sort?: string;
  edit?: string;
  showAdd?: string;
};

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

function normalizeSort(value: string | undefined): "name_asc" | "created_desc" {
  return value === "created_desc" ? "created_desc" : "name_asc";
}

function buildMembersHref(input: {
  q: string;
  activeOnly: boolean;
  sort: "name_asc" | "created_desc";
  edit?: string;
  showAdd?: boolean;
}): string {
  const params = new URLSearchParams();
  if (input.q) {
    params.set("q", input.q);
  }
  if (!input.activeOnly) {
    params.set("active", "all");
  }
  if (input.sort !== "name_asc") {
    params.set("sort", input.sort);
  }
  if (input.edit) {
    params.set("edit", input.edit);
  }
  if (input.showAdd) {
    params.set("showAdd", "1");
  }

  const query = params.toString();
  return query ? `/admin/members?${query}` : "/admin/members";
}

function sortOrder(sort: "name_asc" | "created_desc") {
  if (sort === "created_desc") {
    return [{ createdAt: "desc" as const }];
  }
  return [{ name: "asc" as const }, { createdAt: "desc" as const }];
}

function toneForMemberState(input: { isActive: boolean; status: string }): "success" | "danger" | "info" | "neutral" {
  if (!input.isActive || input.status === "INACTIVE") {
    return "danger";
  }
  if (input.status === "PENDING") {
    return "info";
  }
  if (input.status === "ACTIVE") {
    return "success";
  }
  return "neutral";
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdmin("/admin/members");

  const query = String(searchParams?.q ?? "").trim();
  const activeOnly = searchParams?.active !== "all";
  const sort = normalizeSort(searchParams?.sort);
  const editMemberId = String(searchParams?.edit ?? "").trim();
  const showAddPanel = searchParams?.showAdd === "1";

  async function createMemberAction(formData: FormData) {
    "use server";

    const adminUser = await requireAdmin("/admin/members");

    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const street1 = String(formData.get("street1") ?? "").trim();
    const street2 = String(formData.get("street2") ?? "").trim() || null;
    const city = String(formData.get("city") ?? "").trim();
    const state = String(formData.get("state") ?? "").trim().toUpperCase();
    const zip = String(formData.get("zip") ?? "").trim();
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
    const parsedAddress = validateStructuredAddress({
      street1,
      street2,
      city,
      state,
      zip,
    });
    if (parsedAddress.errors.length > 0) {
      throw new Error(parsedAddress.errors[0]);
    }

    const member = await prisma.member.create({
      data: {
        name,
        email,
        passwordHash: hashPassword(password),
        phone,
        street1: parsedAddress.value.street1,
        street2: parsedAddress.value.street2,
        city: parsedAddress.value.city,
        state: parsedAddress.value.state,
        zip: parsedAddress.value.zip,
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
    const street1 = String(formData.get("street1") ?? "").trim();
    const street2 = String(formData.get("street2") ?? "").trim() || null;
    const city = String(formData.get("city") ?? "").trim();
    const state = String(formData.get("state") ?? "").trim().toUpperCase();
    const zip = String(formData.get("zip") ?? "").trim();
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
    const parsedAddress = validateStructuredAddress({
      street1,
      street2,
      city,
      state,
      zip,
    });
    if (parsedAddress.errors.length > 0) {
      throw new Error(parsedAddress.errors[0]);
    }

    const member = await prisma.member.update({
      where: { id: memberId },
      data: {
        name,
        email,
        phone,
        street1: parsedAddress.value.street1,
        street2: parsedAddress.value.street2,
        city: parsedAddress.value.city,
        state: parsedAddress.value.state,
        zip: parsedAddress.value.zip,
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

  async function toggleMemberActiveAction(formData: FormData) {
    "use server";

    await requireAdmin("/admin/members");

    const memberId = String(formData.get("memberId") ?? "");
    const nextActive = String(formData.get("nextActive") ?? "") === "true";
    if (!memberId) {
      throw new Error("Member ID is required.");
    }

    await prisma.member.update({
      where: { id: memberId },
      data: { isActive: nextActive },
    });

    revalidatePath("/admin/members");
    revalidatePath("/admin");
  }

  const where = {
    role: "MEMBER" as const,
    ...(activeOnly ? { isActive: true } : {}),
    ...(query
      ? {
          OR: [
            {
              name: {
                contains: query,
                mode: "insensitive" as const,
              },
            },
            {
              email: {
                contains: query,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
  };

  const members = await prisma.member.findMany({
    where,
    orderBy: sortOrder(sort),
  });

  const selectedMember = editMemberId
    ? await prisma.member.findFirst({
        where: {
          id: editMemberId,
          role: "MEMBER",
        },
      })
    : null;

  return (
    <PageShell
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="rounded border px-3 py-2 text-sm font-medium hover:bg-gray-100"
            href="/admin/members/import"
          >
            Import CSV
          </Link>
          <Link
            className="rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white"
            href={buildMembersHref({ q: query, activeOnly, sort, showAdd: true })}
          >
            Add Member
          </Link>
        </div>
      }
      subtitle="Roster-first management with fast search, filters, and safer advanced profile edits."
      title="Members"
    >
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" method="get">
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Search roster</span>
            <input
              className="w-full rounded border p-2"
              defaultValue={query}
              name="q"
              placeholder="Search by name or email"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium">Scope</span>
            <select className="w-full rounded border p-2" defaultValue={activeOnly ? "active" : "all"} name="active">
              <option value="active">Active only</option>
              <option value="all">All members</option>
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium">Sort</span>
            <select className="w-full rounded border p-2" defaultValue={sort} name="sort">
              <option value="name_asc">Last name / Name</option>
              <option value="created_desc">Newest created</option>
            </select>
          </label>

          <div className="sm:col-span-2 lg:col-span-4">
            <button className="rounded border px-4 py-2 text-sm font-medium" type="submit">
              Apply Filters
            </button>
            {!activeOnly ? (
              <p className="mt-2 text-xs text-gray-600">Showing active and inactive members.</p>
            ) : null}
          </div>
        </form>
      </section>

      <section className="rounded-xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
              <tr>
                <th className="px-3 py-2">Member</th>
                <th className="px-3 py-2">Flags</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr className="border-b transition hover:bg-gray-50" key={member.id}>
                  <td className="px-3 py-2">
                    <p className="font-medium">{member.name}</p>
                    <p className="text-xs text-gray-600">{member.email}</p>
                    <p className="text-xs text-gray-500">
                      {formatCityState({ city: member.city, state: member.state }) || "Location not set"}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {member.isDisabledVeteran ? <StatusBadge tone="info">DV</StatusBadge> : null}
                      {member.isSenior ? <StatusBadge tone="info">SENIOR</StatusBadge> : null}
                      {!member.isActive ? <StatusBadge tone="danger">INACTIVE</StatusBadge> : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge tone={toneForMemberState({ isActive: member.isActive, status: member.status })}>
                      {member.status}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{member.createdAt.toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <Link
                        className="rounded border px-3 py-1 text-xs font-medium"
                        href={buildMembersHref({
                          q: query,
                          activeOnly,
                          sort,
                          edit: member.id,
                          showAdd: showAddPanel,
                        })}
                      >
                        View / Edit
                      </Link>
                      <form action={toggleMemberActiveAction}>
                        <input name="memberId" type="hidden" value={member.id} />
                        <input name="nextActive" type="hidden" value={member.isActive ? "false" : "true"} />
                        <button
                          className={`rounded border px-3 py-1 text-xs font-medium ${
                            member.isActive
                              ? "border-red-300 text-red-700"
                              : "border-green-300 text-green-700"
                          }`}
                          type="submit"
                        >
                          {member.isActive ? "Deactivate" : "Reactivate"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {members.length === 0 ? (
                <tr>
                  <td className="px-4 py-8" colSpan={5}>
                    <div className="rounded-xl border border-dashed bg-gray-50 p-5 text-sm">
                      <p className="text-base font-semibold text-gray-900">No members found</p>
                      <p className="mt-1 text-gray-700">No members yet. Import a CSV file or add a new member manually.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link className="rounded border px-3 py-1.5 text-xs font-medium" href="/admin/members/import">
                          Import CSV
                        </Link>
                        <Link
                          className="rounded border px-3 py-1.5 text-xs font-medium"
                          href={buildMembersHref({ q: query, activeOnly, sort, showAdd: true })}
                        >
                          Add Member
                        </Link>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selectedMember ? (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Edit Member</h2>
              <p className="text-sm text-gray-600">
                {selectedMember.name} ({selectedMember.email})
              </p>
            </div>
            <Link
              className="rounded border px-3 py-1.5 text-sm font-medium"
              href={buildMembersHref({ q: query, activeOnly, sort, showAdd: showAddPanel })}
            >
              Close
            </Link>
          </div>

          <form action={updateMemberAction} className="grid gap-3 md:grid-cols-2">
            <input name="memberId" type="hidden" value={selectedMember.id} />

            <input className="rounded border p-2" defaultValue={selectedMember.name} name="name" required />
            <input
              className="rounded border p-2"
              defaultValue={selectedMember.email}
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
              defaultValue={selectedMember.phone ?? ""}
              name="phone"
              placeholder="Phone"
            />
            <input
              className="rounded border p-2"
              defaultValue={selectedMember.street1}
              name="street1"
              placeholder="Street address"
              required
            />
            <input
              className="rounded border p-2"
              defaultValue={selectedMember.street2 ?? ""}
              name="street2"
              placeholder="Apt / Suite (optional)"
            />
            <input
              className="rounded border p-2"
              defaultValue={selectedMember.city}
              name="city"
              placeholder="City"
              required
            />
            <input
              className="rounded border p-2 uppercase"
              defaultValue={selectedMember.state}
              maxLength={2}
              name="state"
              placeholder="State (2 letters)"
              required
            />
            <input
              className="rounded border p-2"
              defaultValue={selectedMember.zip}
              name="zip"
              placeholder="ZIP"
              required
            />
            <input
              className="rounded border p-2"
              defaultValue={selectedMember.dob ? selectedMember.dob.toISOString().slice(0, 10) : ""}
              name="dob"
              type="date"
            />

            <div className="flex items-center gap-4 md:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input defaultChecked={selectedMember.isDisabledVeteran} name="isDisabledVeteran" type="checkbox" />
                Disabled veteran
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input defaultChecked={selectedMember.isActive} name="isActive" type="checkbox" />
                Active
              </label>
            </div>

            <details className="rounded border p-4 md:col-span-2">
              <summary className="cursor-pointer text-sm font-semibold">Advanced fields</summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <input
                  className="rounded border p-2"
                  defaultValue={selectedMember.emergencyContactName ?? ""}
                  name="emergencyContactName"
                  placeholder="Emergency contact name"
                />
                <input
                  className="rounded border p-2"
                  defaultValue={selectedMember.emergencyContactPhone ?? ""}
                  name="emergencyContactPhone"
                  placeholder="Emergency contact phone"
                />
                <input
                  className="rounded border p-2 md:col-span-2"
                  defaultValue={selectedMember.emergencyContactRelationship ?? ""}
                  name="emergencyContactRelationship"
                  placeholder="Emergency contact relationship"
                />

                <div className="md:col-span-2">
                  <p className="mb-2 text-sm font-medium">Discipline interests</p>
                  <div className="flex flex-wrap gap-4">
                    {MEMBER_DISCIPLINE_OPTIONS.map((discipline) => (
                      <label className="flex items-center gap-2 text-sm" key={discipline}>
                        <input
                          defaultChecked={selectedMember.disciplineInterests.includes(discipline)}
                          name="disciplineInterests"
                          type="checkbox"
                          value={discipline}
                        />
                        {disciplineLabel(discipline)}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <input
                    className="w-full rounded border p-2"
                    name="dlNumber"
                    placeholder="Set/replace driver license"
                    type="text"
                  />
                  <p className="text-xs text-gray-600">
                    Driver license is encrypted at rest. Reveal requests are audited.
                  </p>
                  <RevealDlButton memberId={selectedMember.id} />
                </div>
              </div>
            </details>

            <div className="md:col-span-2">
              <button className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white" type="submit">
                Save Member
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <details className="rounded-xl border bg-white p-5 shadow-sm" open={showAddPanel}>
        <summary className="cursor-pointer text-lg font-semibold">Add member</summary>
        <p className="mt-1 text-sm text-gray-600">Add a single member manually. Advanced fields are optional.</p>

        <form action={createMemberAction} className="mt-4 grid gap-3 md:grid-cols-2">
          <input className="rounded border p-2" name="name" placeholder="Full name" required />
          <input className="rounded border p-2" name="email" placeholder="Email" type="email" required />
          <input
            className="rounded border p-2"
            name="password"
            placeholder="Temporary password"
            type="password"
            required
          />
          <input className="rounded border p-2" name="phone" placeholder="Phone (optional)" />
          <input className="rounded border p-2" name="street1" placeholder="Street address" required />
          <input className="rounded border p-2" name="street2" placeholder="Apt / Suite (optional)" />
          <input className="rounded border p-2" name="city" placeholder="City" required />
          <input className="rounded border p-2 uppercase" maxLength={2} name="state" placeholder="State (2 letters)" required />
          <input className="rounded border p-2" name="zip" placeholder="ZIP" required />
          <input className="rounded border p-2" name="dob" type="date" />

          <div className="flex items-center gap-4 md:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input defaultChecked name="isActive" type="checkbox" />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input name="isDisabledVeteran" type="checkbox" />
              Disabled veteran
            </label>
          </div>

          <details className="rounded border p-4 md:col-span-2">
            <summary className="cursor-pointer text-sm font-semibold">Advanced fields</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <input className="rounded border p-2" name="emergencyContactName" placeholder="Emergency contact name" />
              <input className="rounded border p-2" name="emergencyContactPhone" placeholder="Emergency contact phone" />
              <input
                className="rounded border p-2 md:col-span-2"
                name="emergencyContactRelationship"
                placeholder="Emergency contact relationship"
              />

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

              <input
                className="rounded border p-2 md:col-span-2"
                name="dlNumber"
                placeholder="Driver license (stored encrypted)"
                type="text"
              />
            </div>
          </details>

          <div className="md:col-span-2">
            <button className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white" type="submit">
              Create Member
            </button>
          </div>
        </form>
      </details>
    </PageShell>
  );
}
