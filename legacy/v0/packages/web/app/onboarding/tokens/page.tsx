"use client";

// Step 3: generate-tokens. Pick employees → generate one-time tokens → reveal.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { api, ApiCallError } from "@/lib/api-client";
import { OnboardingProgress } from "@/components/onboarding/progress";
import {
  TokensReveal,
  type RevealedToken,
} from "@/components/onboarding/tokens-reveal";

interface EmployeeRow {
  id: string;
  name: string;
  email: string;
  role: string;
  title: string | null;
}

// GET /api/employee returns { data: EmployeeRow[] }; api() already unwraps .data.
type EmployeeListResponse = EmployeeRow[];

// POST /api/token/batch returns { data: RevealedToken[] }; api() already unwraps .data.
type BatchResponse = RevealedToken[];

export default function TokensStep() {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<RevealedToken[] | null>(null);

  const employees = useQuery({
    queryKey: ["employees-list"],
    queryFn: () => api<EmployeeListResponse>("/api/employee?limit=500"),
  });

  const allIds = (employees.data ?? []).map((e) => e.id);
  const allPicked =
    allIds.length > 0 && allIds.every((id) => picked.has(id));

  const generate = useMutation({
    mutationFn: () =>
      api<BatchResponse>("/api/token/batch", {
        method: "POST",
        body: { employeeIds: Array.from(picked), expiresInDays: 7 },
      }),
    onSuccess: (r) => setRevealed(r),
  });

  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allPicked) setPicked(new Set());
    else setPicked(new Set(allIds));
  };

  if (revealed) {
    return (
      <div className="space-y-6">
        <OnboardingProgress current="tokens" />
        <TokensReveal
          tokens={revealed}
          onContinue={() => router.push("/onboarding/done")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OnboardingProgress current="tokens" />

      <div className="rounded-lg border bg-card p-6">
        <h1 className="font-serif text-xl">Generate agent tokens</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick employees who'll bring an agent online. We'll generate a
          one-time activation token for each — share it with them once. Tokens
          are stored as hashes; the plain value is shown once and never again.
        </p>

        {employees.isLoading ? (
          <div className="mt-6 flex items-center justify-center py-10 text-muted-foreground">
            <Loader2
              size={16}
              strokeWidth={1.75}
              className="mr-2 animate-spin"
            />
            Loading employees…
          </div>
        ) : employees.error ? (
          <div className="mt-6 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {employees.error instanceof ApiCallError
              ? employees.error.message
              : "Failed to load employees"}
          </div>
        ) : (
          <>
            <div className="mt-6 max-h-80 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b bg-muted/30 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allPicked}
                        onChange={toggleAll}
                      />
                    </th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {(employees.data ?? []).map((e) => (
                    <tr
                      key={e.id}
                      className="cursor-pointer border-b hover:bg-secondary/40 last:border-0"
                      onClick={() => togglePick(e.id)}
                    >
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={picked.has(e.id)}
                          onChange={() => togglePick(e.id)}
                        />
                      </td>
                      <td className="px-3 py-1.5">{e.name}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">
                        {e.email}
                      </td>
                      <td className="px-3 py-1.5 capitalize">{e.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {generate.error ? (
              <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {generate.error instanceof ApiCallError
                  ? generate.error.message
                  : "Failed to generate tokens"}
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {picked.size} selected · 7-day expiry
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-md border bg-card px-4 py-2 text-sm hover:bg-secondary"
                  onClick={() => router.push("/onboarding/done")}
                >
                  Skip
                </button>
                <button
                  type="button"
                  disabled={picked.size === 0 || generate.isPending}
                  onClick={() => generate.mutate()}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {generate.isPending
                    ? "Generating…"
                    : `Generate ${picked.size} token${picked.size === 1 ? "" : "s"} →`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
