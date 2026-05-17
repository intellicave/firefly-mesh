"use client";

// W7 (sprint A): replaces v0 Server Component that imported @firefly-mesh/core
// directly to query Postgres. Now a client-side gate that reads the session
// from hub via authClient + decides destination from /api/me/agents (rewrites
// to hub). Skeleton avoids blank flash while the redirect resolves.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { Skeleton } from "@/components/ui/skeleton";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: session } = await authClient.getSession();
        if (cancelled) return;
        if (!session?.user) {
          router.replace("/login");
          return;
        }
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
          console.error("[root-gate]", err);
          router.replace("/login");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}
