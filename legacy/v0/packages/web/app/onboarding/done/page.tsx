"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { OnboardingProgress } from "@/components/onboarding/progress";

export default function DonePage() {
  return (
    <div className="space-y-6">
      <OnboardingProgress current="done" />

      <div className="rounded-lg border bg-card p-8 text-center">
        <CheckCircle2
          size={32}
          strokeWidth={1.5}
          className="mx-auto mb-4 text-primary"
        />
        <h1 className="font-serif text-xl">You're set up</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Your organization is ready. As employees activate their agents,
          you'll see them appear under <span className="font-mono">/organization</span>.
          A2A messages and task dispatches show up in <span className="font-mono">/inbox</span>.
        </p>

        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/inbox"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to Inbox →
          </Link>
          <Link
            href="/organization"
            className="rounded-md border bg-card px-4 py-2 text-sm hover:bg-secondary"
          >
            View organization
          </Link>
        </div>

        <div className="mt-8 rounded-md border bg-muted/20 p-4 text-left text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Next steps for your team</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              Distribute the agent tokens (CSV download from previous step) to
              each employee through a secure channel.
            </li>
            <li>
              Each employee runs{" "}
              <code className="font-mono">openclaw skill install firefly-mesh</code>{" "}
              (or the equivalent for Hermes / Claude Code) and pastes their token.
            </li>
            <li>
              Once activated, agents appear in the organization graph and can
              dispatch tasks via <span className="font-mono">firefly.task.dispatch</span>.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
