"use client";

// Display generated agent tokens — one-time reveal with copy button + CSV export.
// Per design §6: plain tokens are NEVER stored or fetchable later.

import { useState } from "react";
import { AlertTriangle, Copy, Download, Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";

export interface RevealedToken {
  employeeId: string;
  employeeName: string;
  tokenId: string;
  plainToken: string;
  expiresAt: string;
}

export function TokensReveal({
  tokens,
  onContinue,
}: {
  tokens: RevealedToken[];
  onContinue: () => void;
}) {
  const [revealed, setRevealed] = useState(false);

  const downloadCsv = () => {
    const header =
      "employeeId,employeeName,tokenId,plainToken,expiresAt\r\n";
    const lines = tokens
      .map(
        (t) =>
          `${t.employeeId},${csv(t.employeeName)},${t.tokenId},${t.plainToken},${t.expiresAt}`,
      )
      .join("\r\n");
    const blob = new Blob([header + lines + "\r\n"], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `firefly-mesh-tokens-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyToken = async (plain: string) => {
    try {
      await navigator.clipboard.writeText(plain);
    } catch {
      // best-effort
    }
  };

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle size={14} strokeWidth={2} />
          Save these tokens now — they will not be shown again
        </div>
        <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-400/80">
          Share each plaintext token with the corresponding employee through a
          secure channel. After they activate their agent, the token is
          consumed and revoked.
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <h2 className="font-serif text-base">{tokens.length} tokens generated</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2 text-xs hover:bg-secondary"
          >
            {revealed ? (
              <>
                <EyeOff size={12} strokeWidth={1.75} /> Hide
              </>
            ) : (
              <>
                <Eye size={12} strokeWidth={1.75} /> Reveal
              </>
            )}
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2 text-xs hover:bg-secondary"
          >
            <Download size={12} strokeWidth={1.75} />
            CSV
          </button>
        </div>
      </div>

      <div className="mt-3 max-h-80 overflow-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 border-b bg-muted/30 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Employee</th>
              <th className="px-3 py-1.5 font-medium">Token</th>
              <th className="px-3 py-1.5 font-medium">Expires</th>
              <th className="px-3 py-1.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.tokenId} className="border-b last:border-0">
                <td className="px-3 py-1.5">{t.employeeName}</td>
                <td
                  className={cn(
                    "max-w-[18rem] truncate px-3 py-1.5 font-mono",
                    revealed ? "" : "text-muted-foreground",
                  )}
                >
                  {revealed ? t.plainToken : maskToken(t.plainToken)}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {new Date(t.expiresAt).toLocaleDateString()}
                </td>
                <td className="px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => copyToken(t.plainToken)}
                    className="inline-flex h-6 items-center gap-1 rounded border bg-card px-1.5 text-[10px] hover:bg-secondary"
                  >
                    <Copy size={10} strokeWidth={1.75} />
                    Copy
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onContinue}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          I saved them — continue →
        </button>
      </div>
    </div>
  );
}

function maskToken(plain: string): string {
  if (plain.length <= 8) return "•".repeat(plain.length);
  return plain.slice(0, 4) + "•".repeat(plain.length - 8) + plain.slice(-4);
}

function csv(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
