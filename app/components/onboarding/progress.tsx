"use client";

// Onboarding step indicator. Pure presentational.

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const STEPS = [
  { key: "create-org", label: "Create org" },
  { key: "import", label: "Import employees" },
  { key: "tokens", label: "Generate tokens" },
  { key: "done", label: "Done" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

export function OnboardingProgress({ current }: { current: StepKey }) {
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <ol className="flex items-center gap-2 text-xs">
      {STEPS.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-[10px] font-mono",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : done
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground",
              )}
            >
              {done ? <Check size={12} strokeWidth={2} /> : i + 1}
            </span>
            <span
              className={cn(
                "font-medium",
                active
                  ? "text-foreground"
                  : done
                    ? "text-muted-foreground"
                    : "text-muted-foreground/60",
              )}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 ? (
              <span
                className={cn(
                  "h-px w-6",
                  done ? "bg-primary/40" : "bg-border",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
