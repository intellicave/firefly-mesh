"use client";

// /audit — Audit timeline.
// Sprint A (AE1 / W9): hub M12 only implements write-side audit_log; GET
// /api/audit/* + SSE /api/stream/* not yet served by hub. Both tabs render
// "Coming soon" until the audit-read sprint lands; no network calls happen.

import { History } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useState } from "react";

export default function AuditPage() {
  const [tab, setTab] = useState<"threads" | "log">("threads");

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center border-b bg-card px-6">
        <h1 className="font-serif text-lg leading-tight tracking-tight">
          Audit
        </h1>
      </header>

      <div className="border-b px-6 py-3">
        <Alert>
          <AlertTitle>Audit read-side not available in this sprint</AlertTitle>
          <AlertDescription>
            Hub M12 only implements the audit_log write side. The read-side
            endpoints (GET /api/audit/threads, /api/audit/log) and live SSE
            updates land in the audit-read sprint. Until then this page renders
            an empty state; no audit data is fetched.
          </AlertDescription>
        </Alert>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "threads" | "log")}
        className="flex flex-1 flex-col"
      >
        <TabsList className="mx-6 mt-4 grid w-fit grid-cols-2">
          <TabsTrigger value="threads">Threads</TabsTrigger>
          <TabsTrigger value="log">Log</TabsTrigger>
        </TabsList>

        <TabsContent
          value="threads"
          className="flex-1 overflow-y-auto px-6 pb-6 pt-4"
        >
          <AuditEmptyState kind="threads" />
        </TabsContent>

        <TabsContent
          value="log"
          className="flex-1 overflow-y-auto px-6 pb-6 pt-4"
        >
          <AuditEmptyState kind="log" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AuditEmptyState({ kind }: { kind: "threads" | "log" }) {
  return (
    <EmptyState
      Icon={History}
      title="Coming soon"
      description={
        kind === "threads"
          ? "Hub does not yet serve GET /api/audit/threads. Wait for the audit-read sprint."
          : "Hub does not yet serve GET /api/audit/log. Wait for the audit-read sprint."
      }
    />
  );
}
