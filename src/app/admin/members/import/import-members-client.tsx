"use client";

import { useMemo, useState } from "react";

type ImportTotals = {
  rows: number;
  validRows?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  errors: number;
};

type ImportError = {
  rowNumber: number;
  messages: string[];
};

type ImportPreviewRow = {
  rowNumber: number;
  email: string | null;
  name: string | null;
  isActive: boolean;
  errors: string[];
};

type ImportResponse = {
  mode: "preview" | "import";
  filename: string;
  headers: string[];
  totals: ImportTotals;
  errors: ImportError[];
  preview: ImportPreviewRow[];
};

function parseJsonSafe<T>(raw: string): T | null {
  if (!raw.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function ImportMembersClient() {
  const [file, setFile] = useState<File | null>(null);
  const [upsertByEmail, setUpsertByEmail] = useState(true);
  const [createEnrollmentForCurrentYear, setCreateEnrollmentForCurrentYear] = useState(false);
  const [markImportedMembersActive, setMarkImportedMembersActive] = useState(true);
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const hasPreview = preview !== null;
  const canImport = hasPreview && (preview?.totals.validRows ?? 0) > 0 && file !== null;

  const visibleErrors = useMemo(() => {
    if (!preview && !result) {
      return [];
    }
    return (result?.errors ?? preview?.errors ?? []).slice(0, 20);
  }, [preview, result]);

  async function submit(mode: "preview" | "import") {
    if (!file) {
      setError("Please choose a CSV file first.");
      return;
    }

    setError(null);
    if (mode === "preview") {
      setIsLoadingPreview(true);
      setResult(null);
    } else {
      setIsImporting(true);
    }

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("mode", mode);
      formData.set("upsertByEmail", String(upsertByEmail));
      formData.set("createEnrollmentForCurrentYear", String(createEnrollmentForCurrentYear));
      formData.set("markImportedMembersActive", String(markImportedMembersActive));

      const response = await fetch("/api/admin/members/import", {
        method: "POST",
        body: formData,
      });

      const rawResponse = await response.text();
      const body = parseJsonSafe<ImportResponse & { error?: string }>(rawResponse);
      if (!response.ok) {
        throw new Error(
          body?.error ?? `Import request failed (HTTP ${response.status}).`
        );
      }

      if (!body) {
        throw new Error("Import endpoint returned an empty response.");
      }

      if (mode === "preview") {
        setPreview(body);
      } else {
        setResult(body);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Import failed.");
    } finally {
      if (mode === "preview") {
        setIsLoadingPreview(false);
      } else {
        setIsImporting(false);
      }
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded border bg-white p-6">
        <h2 className="text-xl font-semibold">1) Upload CSV</h2>
        <p className="mt-1 text-sm text-gray-600">
          Preview and validate rows before importing. Role escalation is blocked.
        </p>

        <div className="mt-4 space-y-3">
          <input
            accept=".csv,text/csv"
            className="block w-full rounded border p-2 text-sm"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            type="file"
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              checked={upsertByEmail}
              onChange={(event) => setUpsertByEmail(event.target.checked)}
              type="checkbox"
            />
            Upsert by email (recommended)
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              checked={createEnrollmentForCurrentYear}
              onChange={(event) => setCreateEnrollmentForCurrentYear(event.target.checked)}
              type="checkbox"
            />
            Create enrollment for current membership year if missing
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              checked={markImportedMembersActive}
              onChange={(event) => setMarkImportedMembersActive(event.target.checked)}
              type="checkbox"
            />
            Mark imported members ACTIVE
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={isLoadingPreview || !file}
            onClick={() => submit("preview")}
            type="button"
          >
            {isLoadingPreview ? "Validating..." : "Preview CSV"}
          </button>

          <button
            className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={!canImport || isImporting}
            onClick={() => submit("import")}
            type="button"
          >
            {isImporting ? "Importing..." : "Confirm Import"}
          </button>
        </div>
      </section>

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}

      {preview ? (
        <section className="rounded border bg-white p-6">
          <h2 className="text-xl font-semibold">2) Preview + Validation</h2>
          <p className="mt-1 text-sm text-gray-600">
            Headers detected:{" "}
            <span className="font-mono">{preview.headers.length > 0 ? preview.headers.join(", ") : "(none)"}</span>
          </p>
          <p className="mt-2 text-sm text-gray-700">
            Rows: {preview.totals.rows} | Valid: {preview.totals.validRows ?? 0} | Errors:{" "}
            {preview.totals.errors}
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-2 py-1 text-left">Row</th>
                  <th className="border px-2 py-1 text-left">Email</th>
                  <th className="border px-2 py-1 text-left">Name</th>
                  <th className="border px-2 py-1 text-left">Active</th>
                  <th className="border px-2 py-1 text-left">Errors</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="border px-2 py-1">{row.rowNumber}</td>
                    <td className="border px-2 py-1">{row.email ?? ""}</td>
                    <td className="border px-2 py-1">{row.name ?? ""}</td>
                    <td className="border px-2 py-1">{row.isActive ? "Yes" : "No"}</td>
                    <td className="border px-2 py-1 text-red-700">
                      {row.errors.length > 0 ? row.errors.join("; ") : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {result ? (
        <section className="rounded border border-green-300 bg-green-50 p-6">
          <h2 className="text-xl font-semibold">3) Import Summary</h2>
          <p className="mt-2 text-sm">
            Processed {result.totals.rows} rows: created {result.totals.created ?? 0}, updated{" "}
            {result.totals.updated ?? 0}, skipped {result.totals.skipped ?? 0}, errors{" "}
            {result.totals.errors}.
          </p>
        </section>
      ) : null}

      {visibleErrors.length > 0 ? (
        <section className="rounded border bg-white p-6">
          <h3 className="text-lg font-semibold">Row Errors</h3>
          <ul className="mt-3 space-y-1 text-sm text-red-700">
            {visibleErrors.map((rowError) => (
              <li key={rowError.rowNumber}>
                Row {rowError.rowNumber}: {rowError.messages.join("; ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
