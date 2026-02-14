"use client";

import { useState } from "react";

export function PayRenewalButton({
  disabled,
  disabledReason,
}: {
  disabled: boolean;
  disabledReason?: string;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/payments/stripe/checkout", {
        method: "POST",
      });

      const data = (await response.json()) as {
        url?: string;
        error?: string;
      };

      if (!response.ok || !data.url) {
        setError(data.error ?? "Could not start checkout.");
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("Could not start checkout.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
        disabled={disabled || isSubmitting}
        onClick={handleCheckout}
        type="button"
      >
        {isSubmitting ? "Redirecting to Stripe..." : "Pay Renewal"}
      </button>
      {disabled && disabledReason ? (
        <p className="text-sm text-gray-600">{disabledReason}</p>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
