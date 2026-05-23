"use client";

// Sprint B B.5: client-side redirect for logged-in visitors landing on the
// marketing root. Logged-out users see the marketing JSX without any JS;
// logged-in returning users get hydrated briefly then redirected to /inbox
// (or /onboarding if no agents yet). The brief marketing flash for
// authenticated users is an acceptable V1 trade-off for SEO-friendly /
// fast-first-paint marketing for the vast majority of (anonymous) visitors.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

export function SessionRedirect() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: session } = await authClient.getSession();
        if (cancelled || !session?.user) return;
        // Logged-in: pick destination based on whether they have any agents.
        // Same logic as the pre-B.5 sprint A root-page client gate.
        const res = await fetch("/api/me/agents", {
          credentials: "same-origin",
        });
        if (cancelled) return;
        if (!res.ok) {
          router.replace("/onboarding");
          return;
        }
        const body = (await res.json()) as { data?: unknown[] };
        router.replace(body.data?.length ? "/inbox" : "/onboarding");
      } catch (err) {
        if (!cancelled) {
          // Soft-fail to staying on the marketing page — better than dumping
          // the visitor into /login when the network's flaky.
          console.error("[marketing-session-redirect]", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
