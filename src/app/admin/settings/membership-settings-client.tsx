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

type ActiveTab = "renewal" | "capacity" | "signup" | "tiers";

type FormErrors = {
  renewalOpensAt?: string;
  renewalDueAt?: string;
  membershipCap?: string;
  signupDate?: string;
};

type TierDraft = {
  code: string;
  name: string;
  amountDollars: string;
  isActive: boolean;
  priority: string;
};

function toNyDateInput(isoDate: string): string {
  const date = new Date(isoDate);
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

export function MembershipSettingsClient({ initialYear }: { initialYear: number }) {
  const [year, setYear] = useState(initialYear);
  const [loadedYear, setLoadedYear] = useState(initialYear);
  const [renewalOpensAt, setRenewalOpensAt] = useState("");
  const [renewalDueAt, setRenewalDueAt] = useState("");
  const [membershipCap, setMembershipCap] = useState("350");
  const [signupEnabled, setSignupEnabled] = useState(true);
  const [signupDate, setSignupDate] = useState("");
  const [applicationEnabled, setApplicationEnabled] = useState(false);
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("renewal");
  const [errors, setErrors] = useState<FormErrors>({});
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
      { key: "renewal" as const, label: "Renewal Window" },
      { key: "capacity" as const, label: "Capacity" },
      { key: "signup" as const, label: "Signup + Apply" },
      { key: "tiers" as const, label: "Pricing Tiers" },
    ],
    []
  );

  function applySettings(settings: MembershipYearSettings) {
    setLoadedYear(settings.year);
    setRenewalOpensAt(toNyDateInput(settings.renewalOpensAt));
    setRenewalDueAt(toNyDateInput(settings.renewalDueAt));
    setMembershipCap(String(settings.membershipCap));
    setSignupEnabled(settings.signupEnabled);
    setSignupDate(settings.signupDate ? toNyDateInput(settings.signupDate) : "");
    setApplicationEnabled(settings.applicationEnabled);
    setErrors({});
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
    setErrors({});
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
      setToast({
        tone: "success",
        message: `Loaded settings for ${payload.membershipYear.year}.`,
      });
    } catch (error) {
      setToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not load membership settings.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  function validateForm(): boolean {
    const nextErrors: FormErrors = {};

    if (!renewalOpensAt) {
      nextErrors.renewalOpensAt = "Required.";
    }
    if (!renewalDueAt) {
      nextErrors.renewalDueAt = "Required.";
    }
    if (renewalOpensAt && renewalDueAt && renewalOpensAt > renewalDueAt) {
      nextErrors.renewalDueAt = "Due date must be on or after open date.";
    }

    const parsedCap = Number(membershipCap);
    if (!Number.isInteger(parsedCap) || parsedCap < 1 || parsedCap > 350) {
      nextErrors.membershipCap = "Must be an integer between 1 and 350.";
    }

    if (signupEnabled && signupDate && !signupDate.startsWith(String(year))) {
      nextErrors.signupDate = "Signup date must be within the selected year.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function saveYearSettings() {
    if (!validateForm()) {
      setToast({ tone: "error", message: "Please fix validation errors before saving." });
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/admin/membership-year?year=${year}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          renewalOpensAt,
          renewalDueAt,
          membershipCap: Number(membershipCap),
          signupEnabled,
          signupDate: signupDate || null,
          applicationEnabled,
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
      setToast({ tone: "success", message: "Membership settings saved." });
    } catch (error) {
      setToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not save membership settings.",
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

        {activeTab === "renewal" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Renewal Opens</span>
              <input
                className="w-full rounded border p-2"
                onChange={(event) => setRenewalOpensAt(event.target.value)}
                type="date"
                value={renewalOpensAt}
              />
              {errors.renewalOpensAt ? (
                <span className="mt-1 block text-red-700">{errors.renewalOpensAt}</span>
              ) : null}
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Renewal Due</span>
              <input
                className="w-full rounded border p-2"
                onChange={(event) => setRenewalDueAt(event.target.value)}
                type="date"
                value={renewalDueAt}
              />
              {errors.renewalDueAt ? (
                <span className="mt-1 block text-red-700">{errors.renewalDueAt}</span>
              ) : null}
            </label>
          </div>
        ) : null}

        {activeTab === "capacity" ? (
          <div className="max-w-sm">
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
              {errors.membershipCap ? (
                <span className="mt-1 block text-red-700">{errors.membershipCap}</span>
              ) : null}
            </label>
          </div>
        ) : null}

        {activeTab === "signup" ? (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={signupEnabled}
                onChange={(event) => setSignupEnabled(event.target.checked)}
                type="checkbox"
              />
              Signup day enabled
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                checked={applicationEnabled}
                onChange={(event) => setApplicationEnabled(event.target.checked)}
                type="checkbox"
              />
              Applications open
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium">Signup Date Override (optional)</span>
              <input
                className="w-full max-w-sm rounded border p-2"
                onChange={(event) => setSignupDate(event.target.value)}
                type="date"
                value={signupDate}
              />
              {errors.signupDate ? (
                <span className="mt-1 block text-red-700">{errors.signupDate}</span>
              ) : null}
            </label>
          </div>
        ) : null}

        {activeTab === "tiers" ? (
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
                        No pricing tiers found for this year.
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
          {isSaving ? "Saving..." : "Save Year Settings"}
        </button>
      </div>
    </div>
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
