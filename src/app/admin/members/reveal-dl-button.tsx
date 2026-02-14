"use client";

import { useState } from "react";

export function RevealDlButton({ memberId }: { memberId: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [full, setFull] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReveal() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/members/${memberId}/reveal-dl`, {
        method: "POST",
      });
      const body = (await response.json()) as {
        masked?: string;
        full?: string;
        error?: string;
      };

      if (!response.ok || !body.full) {
        throw new Error(body.error ?? "Could not reveal driver license.");
      }

      setMasked(body.masked ?? null);
      setFull(body.full);
    } catch (revealError) {
      setError(revealError instanceof Error ? revealError.message : "Could not reveal driver license.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        className="rounded border px-3 py-2 text-sm font-medium"
        disabled={isLoading}
        onClick={handleReveal}
        type="button"
      >
        {isLoading ? "Revealing..." : "Reveal DL"}
      </button>
      {masked ? <p className="text-xs text-gray-600">Masked: {masked}</p> : null}
      {full ? <p className="text-xs font-medium text-gray-900">Full: {full}</p> : null}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
