"use client";

import { useEffect, useMemo, useState } from "react";

type MembershipYearSettings = {
  id: string;
  year: number;
  renewalOpensAt: string;
  renewalDueAt: string;
  membershipCap: number;
  signupEnabled: boolean;
  signupDate: string | null;
  applicationEnabled: boolean;
  applicationOpensAt: string | null;
  applicationClosesAt: string | null;
  lateRenewalsEnabled: boolean;
  lateRenewalPolicyNotes: string;
  activeEnrollments: number;
  capacityRemaining: number;
};

type PricingTier = {
  id: string;
  code: string;
  name: string;
  amountCents: number;
  isActive: boolean;
  priority: number;
};

type ToastState = {
  tone: "success" | "error";
  message: string;
} | null;

type ActiveTab =
  | "membership_year"
  | "pricing_tiers"
  | "application_settings"
  | "renewal_settings"
  | "signup_day";

type TierDraft = {
  code: string;
  name: string;
  amountDollars: string;
  isActive: boolean;
  priority: string;
};

function toNyDateInput(isoDate: string | null): string {
  if (!isoDate) {
    return "";
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsToCents(input: string): number {
  return Math.round(Number(input) * 100);
}

function normalizeTierCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "_");
}

function parseLocalDateForApi(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function MembershipSettingsClient({ initialYear }: { initialYear: number }) {
  const [year, setYear] = useState(initialYear);
  const [loadedYear, setLoadedYear] = useState(initialYear);
  const [membershipCap, setMembershipCap] = useState("350");
  const [activeEnrollments, setActiveEnrollments] = useState(0);
  const [capacityRemaining, setCapacityRemaining] = useState(0);

  const [renewalOpensAt, setRenewalOpensAt] = useState("");
  const [renewalDueAt, setRenewalDueAt] = useState("");
  const [lateRenewalsEnabled, setLateRenewalsEnabled] = useState(false);
  const [lateRenewalPolicyNotes, setLateRenewalPolicyNotes] = useState("");

  const [applicationEnabled, setApplicationEnabled] = useState(false);
  const [applicationOpensAt, setApplicationOpensAt] = useState("");
  const [applicationClosesAt, setApplicationClosesAt] = useState("");

  const [signupEnabled, setSignupEnabled] = useState(true);
  const [signupDate, setSignupDate] = useState("");

  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("membership_year");
  const [toast, setToast] = useState<ToastState>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newTier, setNewTier] = useState<TierDraft>({
    code: "",
    name: "",
    amountDollars: "150.00",
    isActive: true,
    priority: "100",
  });

  useEffect(() => {
    void loadYear(initialYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialYear]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timeout);
  }, [toast]);

  const tabs = useMemo(
    () => [
      { key: "membership_year" as const, label: "Membership Year" },
      { key: "pricing_tiers" as const, label: "Pricing Tiers" },
      { key: "application_settings" as const, label: "Application Settings" },
      { key: "renewal_settings" as const, label: "Renewal Settings" },
      { key: "signup_day" as const, label: "Signup Day" },
    ],
    []
  );

  function applySettings(settings: MembershipYearSettings) {
    setLoadedYear(settings.year);
    setMembershipCap(String(settings.membershipCap));
    setActiveEnrollments(settings.activeEnrollments);
    setCapacityRemaining(settings.capacityRemaining);

    setRenewalOpensAt(toNyDateInput(settings.renewalOpensAt));
    setRenewalDueAt(toNyDateInput(settings.renewalDueAt));
    setLateRenewalsEnabled(settings.lateRenewalsEnabled);
    setLateRenewalPolicyNotes(settings.lateRenewalPolicyNotes);

    setApplicationEnabled(settings.applicationEnabled);
    setApplicationOpensAt(toNyDateInput(settings.applicationOpensAt));
    setApplicationClosesAt(toNyDateInput(settings.applicationClosesAt));

    setSignupEnabled(settings.signupEnabled);
    setSignupDate(toNyDateInput(settings.signupDate));
  }

  async function loadPricingTiers(targetYear: number) {
    const response = await fetch(`/api/admin/pricing-tiers?year=${targetYear}`);
    const payload = (await response.json()) as {
      pricingTiers?: PricingTier[];
      error?: string;
    };

    if (!response.ok || !payload.pricingTiers) {
      throw new Error(payload.error ?? "Could not load pricing tiers.");
    }

    setPricingTiers(payload.pricingTiers);
  }

  async function loadYear(targetYear: number) {
    setIsLoading(true);

    try {
      const response = await fetch(`/api/admin/membership-year?year=${targetYear}`);
      const payload = (await response.json()) as {
        membershipYear?: MembershipYearSettings;
        error?: string;
      };

      if (!response.ok || !payload.membershipYear) {
        throw new Error(payload.error ?? "Could not load membership settings.");
      }

      applySettings(payload.membershipYear);
      await loadPricingTiers(targetYear);
      setToast({ tone: "success", message: `Loaded settings for ${payload.membershipYear.year}.` });
    } catch (error) {
      setToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not load membership settings.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function saveYearSettings() {
    setIsSaving(true);

    try {
      const response = await fetch(`/api/admin/membership-year?year=${loadedYear}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          membershipCap: Number(membershipCap),
          renewalOpensAt,
          renewalDueAt,
          lateRenewalsEnabled,
          lateRenewalPolicyNotes,
          applicationEnabled,
          applicationOpensAt: parseLocalDateForApi(applicationOpensAt),
          applicationClosesAt: parseLocalDateForApi(applicationClosesAt),
          signupEnabled,
          signupDate: parseLocalDateForApi(signupDate),
        }),
      });

      const payload = (await response.json()) as {
        membershipYear?: MembershipYearSettings;
        error?: string;
      };

      if (!response.ok || !payload.membershipYear) {
        throw new Error(payload.error ?? "Could not save membership settings.");
      }

      applySettings(payload.membershipYear);
      setToast({ tone: "success", message: "Membership year settings saved." });
    } catch (error) {
      setToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not save settings.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function createTier() {
    try {
      const response = await fetch(`/api/admin/pricing-tiers?year=${loadedYear}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: normalizeTierCode(newTier.code),
          name: newTier.name,
          amountCents: dollarsToCents(newTier.amountDollars),
          isActive: newTier.isActive,
          priority: Number(newTier.priority),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not create pricing tier.");
      }

      await loadPricingTiers(loadedYear);
      setNewTier({
        code: "",
        name: "",
        amountDollars: "150.00",
        isActive: true,
        priority: "100",
      });
      setToast({ tone: "success", message: "Pricing tier created." });
    } catch (error) {
      setToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not create pricing tier.",
      });
    }
  }

  async function saveTier(tierId: string, draft: TierDraft) {
    try {
      const response = await fetch(`/api/admin/pricing-tiers/${tierId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: normalizeTierCode(draft.code),
          name: draft.name,
          amountCents: dollarsToCents(draft.amountDollars),
          isActive: draft.isActive,
          priority: Number(draft.priority),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not update pricing tier.");
      }

      await loadPricingTiers(loadedYear);
      setToast({ tone: "success", message: "Pricing tier updated." });
    } catch (error) {
      setToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not update pricing tier.",
      });
    }
  }

  async function disableTier(tier: PricingTier) {
    await saveTier(tier.id, {
      code: tier.code,
      name: tier.name,
      amountDollars: centsToDollars(tier.amountCents),
      isActive: false,
      priority: String(tier.priority),
    });
  }

  return (
    <div className="space-y-6">
      {toast ? (
        <div
          className={`rounded-lg border p-3 text-sm shadow-sm ${
            toast.tone === "success"
              ? "border-green-300 bg-green-50 text-green-800"
              : "border-red-300 bg-red-50 text-red-800"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Membership Year</span>
            <input
              className="w-40 rounded border p-2"
              max={2100}
              min={2000}
              onChange={(event) => setYear(Number(event.target.value))}
              type="number"
              value={year}
            />
          </label>
          <button
            className="rounded border px-4 py-2 text-sm font-medium"
            disabled={isLoading}
            onClick={() => void loadYear(year)}
            type="button"
          >
            {isLoading ? "Loading..." : "Load Year"}
          </button>
          <p className="text-sm text-gray-600">Editing year {loadedYear}.</p>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              className={`rounded-full px-3 py-1.5 text-sm ${
                activeTab === tab.key ? "bg-gray-900 text-white" : "border bg-white text-gray-700"
              }`}
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "membership_year" ? (
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Active Members" value={activeEnrollments} />
            <MetricCard label="Capacity Remaining" value={capacityRemaining} />
            <label className="text-sm">
              <span className="mb-1 block font-medium">Membership Cap</span>
              <input
                className="w-full rounded border p-2"
                max={350}
                min={1}
                onChange={(event) => setMembershipCap(event.target.value)}
                type="number"
                value={membershipCap}
              />
              <span className="mt-1 block text-xs text-gray-500">
                Capacity controls the number of ACTIVE enrollments allowed for the year.
              </span>
            </label>
          </div>
        ) : null}

        {activeTab === "application_settings" ? (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={applicationEnabled}
                onChange={(event) => setApplicationEnabled(event.target.checked)}
                type="checkbox"
              />
              Applications Open (Public /apply)
            </label>
            <p className="text-xs text-gray-500">
              Applicants can only access /apply while this toggle is enabled and any optional window dates allow it.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Public Open Date (optional)</span>
                <input
                  className="w-full rounded border p-2"
                  onChange={(event) => setApplicationOpensAt(event.target.value)}
                  type="date"
                  value={applicationOpensAt}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Public Close Date (optional)</span>
                <input
                  className="w-full rounded border p-2"
                  onChange={(event) => setApplicationClosesAt(event.target.value)}
                  type="date"
                  value={applicationClosesAt}
                />
              </label>
            </div>
          </div>
        ) : null}

        {activeTab === "renewal_settings" ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Renewal Opens</span>
                <input
                  className="w-full rounded border p-2"
                  onChange={(event) => setRenewalOpensAt(event.target.value)}
                  type="date"
                  value={renewalOpensAt}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Renewal Due</span>
                <input
                  className="w-full rounded border p-2"
                  onChange={(event) => setRenewalDueAt(event.target.value)}
                  type="date"
                  value={renewalDueAt}
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                checked={lateRenewalsEnabled}
                onChange={(event) => setLateRenewalsEnabled(event.target.checked)}
                type="checkbox"
              />
              Accept Late Renewals
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium">Late Renewal Policy Notes</span>
              <textarea
                className="w-full rounded border p-2"
                onChange={(event) => setLateRenewalPolicyNotes(event.target.value)}
                rows={3}
                value={lateRenewalPolicyNotes}
              />
            </label>
          </div>
        ) : null}

        {activeTab === "signup_day" ? (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={signupEnabled}
                onChange={(event) => setSignupEnabled(event.target.checked)}
                type="checkbox"
              />
              Signup Day Scheduled
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium">Signup Day Override</span>
              <input
                className="w-full max-w-sm rounded border p-2"
                onChange={(event) => setSignupDate(event.target.value)}
                type="date"
                value={signupDate}
              />
            </label>
          </div>
        ) : null}

        {activeTab === "pricing_tiers" ? (
          <div className="space-y-5">
            <div className="overflow-x-auto rounded border">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Priority</th>
                    <th className="px-3 py-2">Active</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pricingTiers.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-gray-600" colSpan={6}>
                        No pricing tiers configured for this year.
                      </td>
                    </tr>
                  ) : (
                    pricingTiers.map((tier) => (
                      <TierRow
                        key={tier.id}
                        onDisable={() => void disableTier(tier)}
                        onSave={(draft) => void saveTier(tier.id, draft)}
                        tier={tier}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded border p-4">
              <h3 className="text-sm font-semibold">Add Pricing Tier</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-5">
                <input
                  className="rounded border p-2 text-sm"
                  onChange={(event) => setNewTier((state) => ({ ...state, code: event.target.value }))}
                  placeholder="CODE"
                  value={newTier.code}
                />
                <input
                  className="rounded border p-2 text-sm"
                  onChange={(event) => setNewTier((state) => ({ ...state, name: event.target.value }))}
                  placeholder="Name"
                  value={newTier.name}
                />
                <input
                  className="rounded border p-2 text-sm"
                  onChange={(event) =>
                    setNewTier((state) => ({ ...state, amountDollars: event.target.value }))
                  }
                  placeholder="Amount USD"
                  step="0.01"
                  type="number"
                  value={newTier.amountDollars}
                />
                <input
                  className="rounded border p-2 text-sm"
                  onChange={(event) => setNewTier((state) => ({ ...state, priority: event.target.value }))}
                  placeholder="Priority"
                  type="number"
                  value={newTier.priority}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    checked={newTier.isActive}
                    onChange={(event) =>
                      setNewTier((state) => ({ ...state, isActive: event.target.checked }))
                    }
                    type="checkbox"
                  />
                  Active
                </label>
              </div>
              <button
                className="mt-3 rounded border px-3 py-2 text-sm font-medium"
                onClick={() => void createTier()}
                type="button"
              >
                Create Tier
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <div>
        <button
          className="rounded bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          disabled={isSaving}
          onClick={() => void saveYearSettings()}
          type="button"
        >
          {isSaving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded border p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </article>
  );
}

function TierRow({
  tier,
  onSave,
  onDisable,
}: {
  tier: PricingTier;
  onSave: (draft: TierDraft) => void;
  onDisable: () => void;
}) {
  const [draft, setDraft] = useState<TierDraft>({
    code: tier.code,
    name: tier.name,
    amountDollars: centsToDollars(tier.amountCents),
    isActive: tier.isActive,
    priority: String(tier.priority),
  });

  return (
    <tr className="border-b">
      <td className="px-3 py-2">
        <input
          className="w-32 rounded border p-1 text-sm"
          onChange={(event) => setDraft((state) => ({ ...state, code: event.target.value }))}
          value={draft.code}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className="w-48 rounded border p-1 text-sm"
          onChange={(event) => setDraft((state) => ({ ...state, name: event.target.value }))}
          value={draft.name}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className="w-28 rounded border p-1 text-sm"
          onChange={(event) => setDraft((state) => ({ ...state, amountDollars: event.target.value }))}
          step="0.01"
          type="number"
          value={draft.amountDollars}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className="w-20 rounded border p-1 text-sm"
          onChange={(event) => setDraft((state) => ({ ...state, priority: event.target.value }))}
          type="number"
          value={draft.priority}
        />
      </td>
      <td className="px-3 py-2">
        <label className="flex items-center gap-2 text-xs">
          <input
            checked={draft.isActive}
            onChange={(event) => setDraft((state) => ({ ...state, isActive: event.target.checked }))}
            type="checkbox"
          />
          {draft.isActive ? "Yes" : "No"}
        </label>
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-2">
          <button
            className="rounded border px-2 py-1 text-xs font-medium"
            onClick={() => onSave(draft)}
            type="button"
          >
            Save
          </button>
          {tier.isActive ? (
            <button
              className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700"
              onClick={onDisable}
              type="button"
            >
              Disable
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
