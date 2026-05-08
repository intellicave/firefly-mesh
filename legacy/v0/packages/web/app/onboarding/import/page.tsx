"use client";

// Step 2: import-employees. Upload CSV → preview → confirm.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Upload } from "lucide-react";

import { ApiCallError } from "@/lib/api-client";
import { OnboardingProgress } from "@/components/onboarding/progress";
import {
  ImportPreview,
  type PreviewRow,
} from "@/components/onboarding/import-preview";

interface PreviewResponse {
  data: {
    mode: "preview";
    totalRows: number;
    validCount: number;
    errorCount: number;
    rows: PreviewRow[];
  };
}

interface ImportedResponse {
  data: {
    mode: "imported";
    count: number;
    imported: Array<{ id: string; name: string }>;
  };
}

async function postCsv<T>(file: File, confirm: boolean): Promise<T> {
  const fd = new FormData();
  fd.append("file", file);
  if (confirm) fd.append("confirm", "true");
  const res = await fetch("/api/employee/import", {
    method: "POST",
    body: fd,
    credentials: "same-origin",
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Server returned non-JSON response");
  }
  if (!res.ok) {
    const err = parsed as
      | { error?: { code?: string; message?: string } }
      | undefined;
    throw new ApiCallError(res.status, {
      code: err?.error?.code ?? "HTTP_" + res.status,
      message: err?.error?.message ?? `HTTP ${res.status}`,
    });
  }
  return parsed as T;
}

export default function ImportEmployeesStep() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse["data"] | null>(null);

  const previewMut = useMutation({
    mutationFn: (f: File) => postCsv<PreviewResponse>(f, false),
    onSuccess: (r) => setPreview(r.data),
  });

  const confirmMut = useMutation({
    mutationFn: (f: File) => postCsv<ImportedResponse>(f, true),
    onSuccess: () => router.push("/onboarding/tokens"),
  });

  return (
    <div className="space-y-6">
      <OnboardingProgress current="import" />

      <div className="rounded-lg border bg-card p-6">
        <h1 className="font-serif text-xl">Import your employees</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a CSV with columns{" "}
          <code className="rounded bg-muted px-1 font-mono text-xs">
            name,email,title,role
          </code>{" "}
          (only name + email are required). Preview is shown before any rows
          are written.
        </p>

        <div className="mt-6 space-y-4">
          <div className="flex flex-col items-center gap-3 rounded-md border-2 border-dashed bg-background px-6 py-8">
            <Upload size={20} strokeWidth={1.5} className="text-primary" />
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                setPreview(null);
                if (f) previewMut.mutate(f);
              }}
              className="text-sm"
            />
            {file ? (
              <p className="text-xs text-muted-foreground">
                Selected: {file.name} ({Math.round(file.size / 1024)} KB)
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Drop a CSV here or click to browse
              </p>
            )}
          </div>

          {previewMut.error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {previewMut.error instanceof ApiCallError
                ? previewMut.error.message
                : "Failed to preview CSV"}
            </div>
          ) : null}

          {previewMut.isPending ? (
            <div className="text-sm text-muted-foreground">Parsing…</div>
          ) : null}

          {preview ? (
            <ImportPreview
              total={preview.totalRows}
              validCount={preview.validCount}
              errorCount={preview.errorCount}
              rows={preview.rows}
            />
          ) : null}

          {confirmMut.error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {confirmMut.error instanceof ApiCallError
                ? confirmMut.error.message
                : "Failed to import"}
            </div>
          ) : null}

          <div className="flex justify-between">
            <button
              type="button"
              className="rounded-md border bg-card px-4 py-2 text-sm hover:bg-secondary"
              onClick={() => router.push("/onboarding/tokens")}
            >
              Skip for now
            </button>
            <button
              type="button"
              disabled={
                !file ||
                !preview ||
                preview.errorCount > 0 ||
                preview.validCount === 0 ||
                confirmMut.isPending
              }
              onClick={() => file && confirmMut.mutate(file)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {confirmMut.isPending
                ? "Importing…"
                : preview
                  ? `Import ${preview.validCount} employees →`
                  : "Import"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
