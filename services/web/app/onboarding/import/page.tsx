"use client";

// Step 2: import-employees.
// Sprint A (AE1 / W9): hub has no /api/employee/import multipart CSV endpoint.
// This step is rendered in disabled form with a banner; users continue with
// "Skip" → /onboarding/tokens. Sprint B adds the missing hub endpoint and
// re-enables this page in full.

import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OnboardingProgress } from "@/components/onboarding/progress";

export default function ImportEmployeesStep() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <OnboardingProgress current="import" />

      <Alert variant="warning">
        <AlertTitle>Bulk employee import disabled in sprint A</AlertTitle>
        <AlertDescription>
          Hub does not yet expose <code>POST /api/employees/bulk-import</code>
          {" / "}<code>/api/employee/import</code> (multipart CSV). The endpoint
          ships in sprint B; until then add employees one-by-one via the
          Organization page after onboarding, or skip this step now.
        </AlertDescription>
      </Alert>

      <div className="rounded-lg border bg-card p-6">
        <h1 className="font-serif text-xl">Import your employees</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          When the multipart endpoint lands you&apos;ll be able to upload a CSV
          with columns{" "}
          <code className="rounded bg-muted px-1 font-mono text-xs">
            name,email,title,role
          </code>{" "}
          and preview rows before commit.
        </p>

        <div className="mt-6 flex flex-col items-center gap-3 rounded-md border-2 border-dashed bg-background px-6 py-8 opacity-60">
          <Upload size={20} strokeWidth={1.5} className="text-primary" />
          <input
            type="file"
            accept=".csv,text/csv"
            disabled
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">
            CSV import re-enables in sprint B
          </p>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => router.push("/onboarding/tokens")}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Skip for now →
          </button>
        </div>
      </div>
    </div>
  );
}
