"use client";

import { useEffect, useMemo, useState } from "react";

type MembershipYearSettings = {
  id: string;
  year: number;
  renewalOpensAt: string;
  renewalDueAt: string;
  membershipCap: number;
  standardPriceCents: number;
  discountPriceCents: number;
  signupEnabled: boolean;
  signupDate: string | null;
};

type ToastState = {
  tone: "success" | "error";
  message: string;
} | null;

type ActiveTab = "renewal" | "pricing" | "capacity" | "signup";

type FormErrors = {
  renewalOpensAt?: string;
  renewalDueAt?: string;
  membershipCap?: string;
  standardPriceDollars?: string;
  discountPriceDollars?: string;
  signupDate?: string;
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

export function MembershipSettingsClient({ initialYear }: { initialYear: number }) {
  const [year, setYear] = useState(initialYear);
  const [loadedYear, setLoadedYear] = useState(initialYear);
  const [renewalOpensAt, setRenewalOpensAt] = useState("");
  const [renewalDueAt, setRenewalDueAt] = useState("");
  const [membershipCap, setMembershipCap] = useState("350");
  const [standardPriceDollars, setStandardPriceDollars] = useState("150.00");
  const [discountPriceDollars, setDiscountPriceDollars] = useState("100.00");
  const [signupEnabled, setSignupEnabled] = useState(true);
  const [signupDate, setSignupDate] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("renewal");
  const [errors, setErrors] = useState<FormErrors>({});
  const [toast, setToast] = useState<ToastState>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadYear(initialYear);
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
      { key: "pricing" as const, label: "Pricing" },
      { key: "capacity" as const, label: "Capacity" },
      { key: "signup" as const, label: "Signup Day" },
    ],
    []
  );

  function applySettings(settings: MembershipYearSettings) {
    setLoadedYear(settings.year);
    setRenewalOpensAt(toNyDateInput(settings.renewalOpensAt));
    setRenewalDueAt(toNyDateInput(settings.renewalDueAt));
    setMembershipCap(String(settings.membershipCap));
    setStandardPriceDollars(centsToDollars(settings.standardPriceCents));
    setDiscountPriceDollars(centsToDollars(settings.discountPriceCents));
    setSignupEnabled(settings.signupEnabled);
    setSignupDate(settings.signupDate ? toNyDateInput(settings.signupDate) : "");
    setErrors({});
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

    const standard = Number(standardPriceDollars);
    const discount = Number(discountPriceDollars);
    if (!Number.isFinite(standard) || standard < 0) {
      nextErrors.standardPriceDollars = "Must be a valid dollar amount.";
    }
    if (!Number.isFinite(discount) || discount < 0) {
      nextErrors.discountPriceDollars = "Must be a valid dollar amount.";
    }
    if (Number.isFinite(standard) && Number.isFinite(discount) && discount > standard) {
      nextErrors.discountPriceDollars = "Discount cannot exceed standard price.";
    }

    if (signupEnabled && signupDate && !signupDate.startsWith(String(year))) {
      nextErrors.signupDate = "Signup date must be within the selected year.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function save() {
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
          standardPriceCents: dollarsToCents(standardPriceDollars),
          discountPriceCents: dollarsToCents(discountPriceDollars),
          signupEnabled,
          signupDate: signupDate || null,
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
            onClick={() => loadYear(year)}
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
                activeTab === tab.key
                  ? "bg-gray-900 text-white"
                  : "border bg-white text-gray-700"
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
              ) : (
                <span className="mt-1 block text-gray-500">First date renewal payments are allowed.</span>
              )}
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
              ) : (
                <span className="mt-1 block text-gray-500">After this date, late policy applies.</span>
              )}
            </label>
          </div>
        ) : null}

        {activeTab === "pricing" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Standard Price (USD)</span>
              <input
                className="w-full rounded border p-2"
                onChange={(event) => setStandardPriceDollars(event.target.value)}
                step="0.01"
                type="number"
                value={standardPriceDollars}
              />
              {errors.standardPriceDollars ? (
                <span className="mt-1 block text-red-700">{errors.standardPriceDollars}</span>
              ) : null}
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Discount Price (USD)</span>
              <input
                className="w-full rounded border p-2"
                onChange={(event) => setDiscountPriceDollars(event.target.value)}
                step="0.01"
                type="number"
                value={discountPriceDollars}
              />
              {errors.discountPriceDollars ? (
                <span className="mt-1 block text-red-700">{errors.discountPriceDollars}</span>
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
              ) : (
                <span className="mt-1 block text-gray-500">
                  Active enrollment limit for this year (maximum 350).
                </span>
              )}
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
              ) : (
                <span className="mt-1 block text-gray-500">
                  Leave blank to keep the default signup scheduling behavior.
                </span>
              )}
            </label>
          </div>
        ) : null}
      </section>

      <div>
        <button
          className="rounded bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          disabled={isSaving}
          onClick={save}
          type="button"
        >
          {isSaving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
