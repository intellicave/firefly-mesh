"use client";

// Onboarding step 2: bulk-import employees via CSV.
// Sprint B B.4: re-enabled. Hub now exposes POST /api/employees/bulk-import
// (added in B.0, commit d0e6630). Flow:
//   1. User picks a CSV file
//   2. We POST it with ?mode=dryRun → server validates each row, returns
//      { total, valid, invalid, created: 0, errors[] }
//   3. We render <ImportPreview /> from the dryRun response
//   4. User clicks "Import N employees" → we POST with ?mode=commit
//   5. Show success summary → continue to /onboarding/tokens

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";

import {
  ImportPreview,
  type PreviewRow,
} from "@/components/onboarding/import-preview";
import { OnboardingProgress } from "@/components/onboarding/progress";

interface BulkImportError {
  rowNumber: number;
  email?: string;
  field?: string;
  message: string;
}

interface BulkImportResult {
  mode: "dryRun" | "commit";
  total: number;
  valid: number;
  invalid: number;
  created: number;
  errors: BulkImportError[];
}

type Phase = "pick" | "preview" | "committing" | "done";

export default function ImportEmployeesStep() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dryResult, setDryResult] = useState<BulkImportResult | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [commitResult, setCommitResult] = useState<BulkImportResult | null>(
    null,
  );

  async function readCsvHeadAndBuildPreview(
    csv: File,
    result: BulkImportResult,
  ): Promise<PreviewRow[]> {
    // The bulk-import response gives us {valid, invalid, errors[]}. To render
    // a row-by-row preview we re-parse the CSV header + rows client-side
    // and reconcile by row number (errors[].rowNumber is the human row
    // number — 1-indexed; header row = 1, first data row = 2).
    const text = await csv.text();
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return [];
    const header = (lines[0] ?? "").split(",").map((c) => c.trim().toLowerCase());
    const nameCol = header.indexOf("name");
    const emailCol = header.indexOf("email");
    const titleCol = header.indexOf("title");
    const roleCol = header.indexOf("role");
    const errorsByRow = new Map(
      result.errors.map((e) => [e.rowNumber, e]),
    );

    const out: PreviewRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim()) continue;
      const cols = line.split(",").map((c) => c.trim());
      const rowNum = i + 1; // matches hub's row-numbering
      const err = errorsByRow.get(rowNum);
      const raw = {
        name: nameCol >= 0 ? cols[nameCol] ?? "" : "",
        email: emailCol >= 0 ? cols[emailCol] ?? "" : "",
        title: titleCol >= 0 ? cols[titleCol] ?? "" : "",
        role: roleCol >= 0 ? cols[roleCol] ?? "" : "",
      };
      out.push({
        rowNum,
        raw,
        ok: !err,
        error: err
          ? `${err.field ? `${err.field}: ` : ""}${err.message}`
          : undefined,
      });
    }
    return out;
  }

  async function postBulk(
    csv: File,
    mode: "dryRun" | "commit",
  ): Promise<BulkImportResult> {
    const fd = new FormData();
    fd.append("file", csv, csv.name);
    const res = await fetch(`/api/employees/bulk-import?mode=${mode}`, {
      method: "POST",
      credentials: "same-origin",
      body: fd,
    });
    const body = (await res.json()) as
      | { data: BulkImportResult }
      | { error: { code: string; message: string } };
    if (!res.ok || "error" in body) {
      const msg =
        "error" in body ? body.error.message : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return body.data;
  }

  async function onFilePicked(picked: File) {
    setFile(picked);
    setError(null);
    setDryResult(null);
    setPreviewRows([]);
    try {
      const result = await postBulk(picked, "dryRun");
      const rows = await readCsvHeadAndBuildPreview(picked, result);
      setDryResult(result);
      setPreviewRows(rows);
      setPhase("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to validate CSV");
      setPhase("pick");
    }
  }

  async function onCommit() {
    if (!file) return;
    setPhase("committing");
    setError(null);
    try {
      const result = await postBulk(file, "commit");
      setCommitResult(result);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import CSV");
      setPhase("preview");
    }
  }

  return (
    <div className="space-y-6">
      <OnboardingProgress current="import" />

      <div className="rounded-lg border bg-card p-6">
        <h1 className="font-serif text-xl">Import your employees</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a CSV with columns{" "}
          <code className="rounded bg-muted px-1 font-mono text-xs">
            name,email,title,role
          </code>
          . We'll preview every row before committing — invalid rows are
          flagged and excluded.
        </p>

        {phase === "pick" || phase === "preview" || phase === "committing" ? (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-md border-2 border-dashed bg-background px-6 py-8">
            <Upload size={20} strokeWidth={1.5} className="text-primary" />
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={phase === "committing"}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFilePicked(f);
              }}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Max 5 MB · max 5,000 rows
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {phase === "preview" && dryResult ? (
          <div className="mt-6 space-y-4">
            <ImportPreview
              total={dryResult.total}
              validCount={dryResult.valid}
              errorCount={dryResult.invalid}
              rows={previewRows}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setDryResult(null);
                  setPreviewRows([]);
                  setPhase("pick");
                }}
                className="rounded-md border bg-background px-4 py-2 text-sm hover:bg-secondary"
              >
                Choose another file
              </button>
              <button
                type="button"
                onClick={onCommit}
                disabled={dryResult.valid === 0}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Import {dryResult.valid} employee
                {dryResult.valid === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        ) : null}

        {phase === "committing" ? (
          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            Importing…
          </div>
        ) : null}

        {phase === "done" && commitResult ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
              <p className="font-medium text-emerald-700 dark:text-emerald-400">
                Imported {commitResult.created} employee
                {commitResult.created === 1 ? "" : "s"}.
              </p>
              {commitResult.errors.length > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {commitResult.errors.length} row
                  {commitResult.errors.length === 1 ? "" : "s"} skipped due to
                  validation errors — review and re-upload to add them.
                </p>
              ) : null}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => router.push("/onboarding/tokens")}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Continue →
              </button>
            </div>
          </div>
        ) : null}

        {phase === "pick" ? (
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => router.push("/onboarding/tokens")}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Skip for now →
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
