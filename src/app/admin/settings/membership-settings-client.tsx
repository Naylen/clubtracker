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
  applicationSignupDayGateEnabled: boolean;
  applicationSignupGateStartsAt: string | null;
  applicationSignupGateEndsAt: string | null;
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

type MembershipDraft = {
  membershipCap: string;
  renewalOpensAt: string;
  renewalDueAt: string;
  lateRenewalsEnabled: boolean;
  lateRenewalPolicyNotes: string;
  applicationEnabled: boolean;
  applicationOpensAt: string;
  applicationClosesAt: string;
  enforceSignupDayWindow: boolean;
  applicationSignupGateStartsAt: string;
  applicationSignupGateEndsAt: string;
  signupEnabled: boolean;
  signupDate: string;
};

const TAB_KEYS: ActiveTab[] = [
  "membership_year",
  "pricing_tiers",
  "application_settings",
  "renewal_settings",
  "signup_day",
];

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

function toNyDateTimeInput(isoDate: string | null): string {
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
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function normalizeTab(tab: string | undefined): ActiveTab {
  if (tab && TAB_KEYS.includes(tab as ActiveTab)) {
    return tab as ActiveTab;
  }
  return "membership_year";
}

function tierToDraft(tier: PricingTier): TierDraft {
  return {
    code: tier.code,
    name: tier.name,
    amountDollars: centsToDollars(tier.amountCents),
    isActive: tier.isActive,
    priority: String(tier.priority),
  };
}

function buildMembershipDraft(state: MembershipDraft): MembershipDraft {
  return {
    ...state,
    lateRenewalPolicyNotes: state.lateRenewalPolicyNotes.trim(),
    applicationOpensAt: state.applicationOpensAt.trim(),
    applicationClosesAt: state.applicationClosesAt.trim(),
    applicationSignupGateStartsAt: state.applicationSignupGateStartsAt.trim(),
    applicationSignupGateEndsAt: state.applicationSignupGateEndsAt.trim(),
    signupDate: state.signupDate.trim(),
  };
}

function areMembershipDraftsEqual(left: MembershipDraft | null, right: MembershipDraft): boolean {
  if (!left) {
    return false;
  }

  const normalizedLeft = buildMembershipDraft(left);
  const normalizedRight = buildMembershipDraft(right);
  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

function isTierDirty(tier: PricingTier, draft: TierDraft | undefined): boolean {
  if (!draft) {
    return false;
  }

  return (
    normalizeTierCode(draft.code) !== tier.code ||
    draft.name.trim() !== tier.name ||
    dollarsToCents(draft.amountDollars) !== tier.amountCents ||
    draft.isActive !== tier.isActive ||
    Number(draft.priority) !== tier.priority
  );
}

export function MembershipSettingsClient({
  initialYear,
  initialTab,
}: {
  initialYear: number;
  initialTab?: string;
}) {
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
  const [enforceSignupDayWindow, setEnforceSignupDayWindow] = useState(false);
  const [applicationSignupGateStartsAt, setApplicationSignupGateStartsAt] = useState("");
  const [applicationSignupGateEndsAt, setApplicationSignupGateEndsAt] = useState("");

  const [signupEnabled, setSignupEnabled] = useState(true);
  const [signupDate, setSignupDate] = useState("");

  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [tierDrafts, setTierDrafts] = useState<Record<string, TierDraft>>({});

  const [activeTab, setActiveTab] = useState<ActiveTab>(normalizeTab(initialTab));
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

  const [membershipBaseline, setMembershipBaseline] = useState<MembershipDraft | null>(null);

  useEffect(() => {
    setActiveTab(normalizeTab(initialTab));
  }, [initialTab]);

  useEffect(() => {
    void loadYear(initialYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialYear]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = setTimeout(() => setToast(null), 3500);
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

  const membershipDirty = useMemo(
    () => {
      const currentDraft: MembershipDraft = {
        membershipCap,
        renewalOpensAt,
        renewalDueAt,
        lateRenewalsEnabled,
        lateRenewalPolicyNotes,
        applicationEnabled,
        applicationOpensAt,
        applicationClosesAt,
        enforceSignupDayWindow,
        applicationSignupGateStartsAt,
        applicationSignupGateEndsAt,
        signupEnabled,
        signupDate,
      };

      return membershipBaseline ? !areMembershipDraftsEqual(membershipBaseline, currentDraft) : false;
    },
    [
      membershipBaseline,
      membershipCap,
      renewalOpensAt,
      renewalDueAt,
      lateRenewalsEnabled,
      lateRenewalPolicyNotes,
      applicationEnabled,
      applicationOpensAt,
      applicationClosesAt,
      enforceSignupDayWindow,
      applicationSignupGateStartsAt,
      applicationSignupGateEndsAt,
      signupEnabled,
      signupDate,
    ]
  );

  const dirtyTierIds = useMemo(
    () =>
      pricingTiers
        .filter((tier) => isTierDirty(tier, tierDrafts[tier.id]))
        .map((tier) => tier.id),
    [pricingTiers, tierDrafts]
  );

  const hasUnsavedChanges = membershipDirty || dirtyTierIds.length > 0;

  const dirtySummary = useMemo(() => {
    const parts: string[] = [];
    if (membershipDirty) {
      parts.push("Membership settings");
    }
    if (dirtyTierIds.length > 0) {
      parts.push(`Pricing tiers (${dirtyTierIds.length})`);
    }
    return parts.join(" and ");
  }, [membershipDirty, dirtyTierIds.length]);

  function applySettings(settings: MembershipYearSettings) {
    const nextDraft: MembershipDraft = {
      membershipCap: String(settings.membershipCap),
      renewalOpensAt: toNyDateInput(settings.renewalOpensAt),
      renewalDueAt: toNyDateInput(settings.renewalDueAt),
      lateRenewalsEnabled: settings.lateRenewalsEnabled,
      lateRenewalPolicyNotes: settings.lateRenewalPolicyNotes,
      applicationEnabled: settings.applicationEnabled,
      applicationOpensAt: toNyDateInput(settings.applicationOpensAt),
      applicationClosesAt: toNyDateInput(settings.applicationClosesAt),
      enforceSignupDayWindow: settings.applicationSignupDayGateEnabled,
      applicationSignupGateStartsAt: toNyDateTimeInput(settings.applicationSignupGateStartsAt),
      applicationSignupGateEndsAt: toNyDateTimeInput(settings.applicationSignupGateEndsAt),
      signupEnabled: settings.signupEnabled,
      signupDate: toNyDateInput(settings.signupDate),
    };

    setLoadedYear(settings.year);
    setActiveEnrollments(settings.activeEnrollments);
    setCapacityRemaining(settings.capacityRemaining);

    setMembershipCap(nextDraft.membershipCap);
    setRenewalOpensAt(nextDraft.renewalOpensAt);
    setRenewalDueAt(nextDraft.renewalDueAt);
    setLateRenewalsEnabled(nextDraft.lateRenewalsEnabled);
    setLateRenewalPolicyNotes(nextDraft.lateRenewalPolicyNotes);
    setApplicationEnabled(nextDraft.applicationEnabled);
    setApplicationOpensAt(nextDraft.applicationOpensAt);
    setApplicationClosesAt(nextDraft.applicationClosesAt);
    setEnforceSignupDayWindow(nextDraft.enforceSignupDayWindow);
    setApplicationSignupGateStartsAt(nextDraft.applicationSignupGateStartsAt);
    setApplicationSignupGateEndsAt(nextDraft.applicationSignupGateEndsAt);
    setSignupEnabled(nextDraft.signupEnabled);
    setSignupDate(nextDraft.signupDate);

    setMembershipBaseline(nextDraft);
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
    setTierDrafts(
      Object.fromEntries(payload.pricingTiers.map((tier) => [tier.id, tierToDraft(tier)]))
    );
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
    } catch (error) {
      setToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not load membership settings.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function saveMembershipSettingsIfDirty(): Promise<boolean> {
    if (!membershipDirty) {
      return false;
    }

    const parsedCap = Number(membershipCap);
    if (!Number.isFinite(parsedCap)) {
      throw new Error("Membership cap must be a valid number.");
    }

    const response = await fetch(`/api/admin/membership-year?year=${loadedYear}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        membershipCap: parsedCap,
        renewalOpensAt,
        renewalDueAt,
        lateRenewalsEnabled,
        lateRenewalPolicyNotes,
        applicationEnabled,
        applicationOpensAt: parseLocalDateForApi(applicationOpensAt),
        applicationClosesAt: parseLocalDateForApi(applicationClosesAt),
        enforceSignupDayWindow,
        applicationSignupGateStartsAt: parseLocalDateForApi(applicationSignupGateStartsAt),
        applicationSignupGateEndsAt: parseLocalDateForApi(applicationSignupGateEndsAt),
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
    return true;
  }

  async function saveTierById(tierId: string): Promise<void> {
    const draft = tierDrafts[tierId];
    if (!draft) {
      return;
    }

    const response = await fetch(`/api/admin/pricing-tiers/${tierId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: normalizeTierCode(draft.code),
        name: draft.name.trim(),
        amountCents: dollarsToCents(draft.amountDollars),
        isActive: draft.isActive,
        priority: Number(draft.priority),
      }),
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Could not update pricing tier.");
    }
  }

  async function saveAllChanges() {
    if (!hasUnsavedChanges) {
      return;
    }

    setIsSaving(true);

    try {
      const dirtyIds = [...dirtyTierIds];
      const membershipSaved = await saveMembershipSettingsIfDirty();

      for (const tierId of dirtyIds) {
        await saveTierById(tierId);
      }

      if (dirtyIds.length > 0) {
        await loadPricingTiers(loadedYear);
      }

      const changesSaved = membershipSaved || dirtyIds.length > 0;
      if (changesSaved) {
        setToast({ tone: "success", message: "Settings saved." });
      }
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
          name: newTier.name.trim(),
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

  function updateTierDraft(tierId: string, patch: Partial<TierDraft>) {
    setTierDrafts((current) => ({
      ...current,
      [tierId]: {
        ...(current[tierId] ?? {
          code: "",
          name: "",
          amountDollars: "0.00",
          isActive: true,
          priority: "100",
        }),
        ...patch,
      },
    }));
  }

  function disableTierWithConfirm(tierId: string) {
    const confirmed = window.confirm("Disable this pricing tier?");
    if (!confirmed) {
      return;
    }
    updateTierDraft(tierId, { isActive: false });
  }

  return (
    <div className="space-y-6">
      {toast ? (
        <div className="fixed right-4 top-20 z-50">
          <div
            className={`rounded-lg border px-4 py-3 text-sm shadow-lg ${
              toast.tone === "success"
                ? "border-green-300 bg-green-50 text-green-800"
                : "border-red-300 bg-red-50 text-red-800"
            }`}
          >
            {toast.message}
          </div>
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
                Capacity controls ACTIVE enrollments allowed for the year.
              </span>
            </label>
          </div>
        ) : null}

        {activeTab === "application_settings" ? (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={applicationEnabled}
                onChange={(event) => {
                  if (applicationEnabled && !event.target.checked) {
                    const confirmed = window.confirm(
                      "Close Applications Open (Public /apply)?"
                    );
                    if (!confirmed) {
                      return;
                    }
                  }
                  setApplicationEnabled(event.target.checked);
                }}
                type="checkbox"
              />
              Applications Open (Public /apply)
            </label>
            <p className="text-xs text-gray-500">
              Public applicants can only access /apply while enabled and inside optional date windows.
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

            <div className="rounded border p-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={enforceSignupDayWindow}
                  onChange={(event) => setEnforceSignupDayWindow(event.target.checked)}
                  type="checkbox"
                />
                Signup Day Gate (restrict public /apply to signup-day window)
              </label>
              <p className="mt-2 text-xs text-gray-500">
                Leave start/end blank to use the signup day date from 12:00 AM to 11:59 PM America/New_York.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Gate Start (optional)</span>
                  <input
                    className="w-full rounded border p-2"
                    onChange={(event) => setApplicationSignupGateStartsAt(event.target.value)}
                    type="datetime-local"
                    value={applicationSignupGateStartsAt}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Gate End (optional)</span>
                  <input
                    className="w-full rounded border p-2"
                    onChange={(event) => setApplicationSignupGateEndsAt(event.target.value)}
                    type="datetime-local"
                    value={applicationSignupGateEndsAt}
                  />
                </label>
              </div>
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
                    <th className="w-52 px-3 py-2">Code</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="w-40 px-3 py-2">Amount (USD)</th>
                    <th className="w-24 px-3 py-2">Priority</th>
                    <th className="w-24 px-3 py-2">Active</th>
                    <th className="w-28 px-3 py-2">Actions</th>
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
                        draft={tierDrafts[tier.id] ?? tierToDraft(tier)}
                        key={tier.id}
                        onChange={(patch) => updateTierDraft(tier.id, patch)}
                        onDisable={() => disableTierWithConfirm(tier.id)}
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
                  placeholder="Amount"
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

      {(hasUnsavedChanges || isSaving) && (
        <div className="fixed inset-x-0 bottom-4 z-40 px-4">
          <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 shadow-lg">
            <p className="text-sm text-gray-700">
              {hasUnsavedChanges ? `Unsaved changes: ${dirtySummary}` : "Saving changes..."}
            </p>
            <button
              className="rounded bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={!hasUnsavedChanges || isSaving}
              onClick={() => void saveAllChanges()}
              type="button"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}
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
  draft,
  onChange,
  onDisable,
}: {
  tier: PricingTier;
  draft: TierDraft;
  onChange: (patch: Partial<TierDraft>) => void;
  onDisable: () => void;
}) {
  return (
    <tr className="border-b">
      <td className="px-3 py-2">
        <input
          className="w-full rounded border p-1 text-sm font-mono"
          onChange={(event) => onChange({ code: event.target.value })}
          value={draft.code}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className="w-full rounded border p-1 text-sm"
          onChange={(event) => onChange({ name: event.target.value })}
          value={draft.name}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className="w-full rounded border p-1 text-sm"
          onChange={(event) => onChange({ amountDollars: event.target.value })}
          step="0.01"
          type="number"
          value={draft.amountDollars}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className="w-full rounded border p-1 text-sm"
          onChange={(event) => onChange({ priority: event.target.value })}
          type="number"
          value={draft.priority}
        />
      </td>
      <td className="px-3 py-2">
        <label className="flex items-center gap-2 text-xs">
          <input
            checked={draft.isActive}
            onChange={(event) => onChange({ isActive: event.target.checked })}
            type="checkbox"
          />
          {draft.isActive ? "Yes" : "No"}
        </label>
      </td>
      <td className="px-3 py-2">
        {tier.isActive ? (
          <button
            className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700"
            onClick={onDisable}
            type="button"
          >
            Disable
          </button>
        ) : (
          <span className="text-xs text-gray-500">Inactive</span>
        )}
      </td>
    </tr>
  );
}
