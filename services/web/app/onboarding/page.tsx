"use client";

// /onboarding — entry point. Reads aggregate onboarding state (lib/onboarding)
// and redirects to the right step (or to /inbox if already done).

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { ApiCallError } from "@/lib/api-client";
import {
  fetchOnboardingState,
  type OnboardingStateResponse,
} from "@/lib/onboarding";

export default function OnboardingIndex() {
  const router = useRouter();
  const state = useQuery<OnboardingStateResponse>({
    queryKey: ["onboarding-state"],
    queryFn: fetchOnboardingState,
    retry: false,
  });

  useEffect(() => {
    if (!state.data) return;
    const target =
      state.data.step === "done"
        ? "/inbox"
        : `/onboarding/${state.data.step}`;
    router.replace(target);
  }, [state.data, router]);

  if (state.error instanceof ApiCallError && state.error.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  return (
    <div className="rounded-lg border bg-card px-6 py-12 text-center">
      <Loader2
        size={20}
        strokeWidth={1.5}
        className="mx-auto mb-3 animate-spin text-primary"
      />
      <p className="text-sm text-muted-foreground">Loading your workspace…</p>
    </div>
  );
}
