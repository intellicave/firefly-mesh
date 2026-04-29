"use client";

import { AlertTriangle, Check } from "lucide-react";

export interface PreviewRow {
  rowNum: number;
  raw: Record<string, string>;
  ok: boolean;
  error?: string;
  parsed?: {
    name: string;
    email: string;
    title?: string;
    role: "owner" | "admin" | "manager" | "employee" | "auditor";
  };
}

export function ImportPreview({
  total,
  validCount,
  errorCount,
  rows,
}: {
  total: number;
  validCount: number;
  errorCount: number;
  rows: PreviewRow[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm">
        <span className="rounded-md bg-secondary px-2 py-0.5 font-mono">
          {total} rows
        </span>
        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
          <Check size={12} strokeWidth={2} /> {validCount} valid
        </span>
        {errorCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-destructive">
            <AlertTriangle size={12} strokeWidth={2} /> {errorCount} errors
          </span>
        ) : null}
      </div>

      <div className="max-h-72 overflow-auto rounded-md border bg-card">
        <table className="w-full text-xs">
          <thead className="border-b bg-muted/30 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Row</th>
              <th className="px-3 py-1.5 font-medium">Name</th>
              <th className="px-3 py-1.5 font-medium">Email</th>
              <th className="px-3 py-1.5 font-medium">Title</th>
              <th className="px-3 py-1.5 font-medium">Role</th>
              <th className="px-3 py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.rowNum}
                className={
                  r.ok
                    ? "border-b last:border-0"
                    : "border-b bg-destructive/5 last:border-0"
                }
              >
                <td className="px-3 py-1.5 font-mono text-muted-foreground">
                  {r.rowNum}
                </td>
                <td className="px-3 py-1.5">{r.raw.name}</td>
                <td className="px-3 py-1.5 font-mono">{r.raw.email}</td>
                <td className="px-3 py-1.5">{r.raw.title ?? "—"}</td>
                <td className="px-3 py-1.5">{r.raw.role ?? "employee"}</td>
                <td className="px-3 py-1.5">
                  {r.ok ? (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      ok
                    </span>
                  ) : (
                    <span className="text-destructive" title={r.error}>
                      {r.error?.slice(0, 60) ?? "error"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
