"use client";

// /audit — Audit timeline.
// Two views: Threads (A2A conversation history) + Log (raw audit_log feed).
// SSE: subscribes to audit.org.{orgId} for live append.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, History, Loader2, MessageSquare } from "lucide-react";

import { api, ApiCallError } from "@/lib/api-client";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThreadDrawer } from "@/components/audit/thread-drawer";

interface ThreadOverview {
  id: string;
  topic: string | null;
  relatedTaskId: string | null;
  messageCount: string | number | null;
  createdAt: string;
}

interface ThreadsResponse {
  threads: ThreadOverview[];
  nextCursor: string | null;
}

interface AuditEntry {
  id: string;
  orgId: string;
  actorType: "human" | "agent" | "system";
  actorId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditLogResponse {
  entries: AuditEntry[];
  nextCursor: string | null;
}

interface MeResponse {
  org: { id: string };
}

export default function AuditPage() {
  const [tab, setTab] = useState<"threads" | "log">("threads");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeResponse>("/api/me"),
  });

  const threads = useQuery({
    queryKey: ["audit-threads"],
    queryFn: () => api<ThreadsResponse>("/api/audit/threads?limit=100"),
    refetchInterval: 30_000,
  });

  const log = useQuery({
    queryKey: ["audit-log"],
    queryFn: () => api<AuditLogResponse>("/api/audit/log?limit=200"),
    refetchInterval: 30_000,
    enabled: tab === "log",
  });

  // Subscribe to live audit channel
  const orgId = me.data?.org.id;
  useEffect(() => {
    if (!orgId) return;
    const url = `/api/stream/${encodeURIComponent(`audit.org.${orgId}`)}`;
    const es = new EventSource(url);
    es.onmessage = () => {
      void queryClient.invalidateQueries({ queryKey: ["audit-threads"] });
      void queryClient.invalidateQueries({ queryKey: ["audit-log"] });
    };
    es.onerror = () => {
      // best-effort — SSE will reconnect automatically per spec
    };
    return () => {
      es.close();
    };
  }, [orgId, queryClient]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center border-b bg-card px-6">
        <h1 className="font-serif text-lg leading-tight tracking-tight">Audit</h1>
        <span className="ml-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Live
        </span>
      </header>

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
          <ThreadsView
            data={threads.data}
            isLoading={threads.isLoading}
            error={threads.error}
            onPick={setSelectedThreadId}
          />
        </TabsContent>

        <TabsContent
          value="log"
          className="flex-1 overflow-y-auto px-6 pb-6 pt-4"
        >
          <LogView
            data={log.data}
            isLoading={log.isLoading}
            error={log.error}
          />
        </TabsContent>
      </Tabs>

      <ThreadDrawer
        threadId={selectedThreadId}
        onClose={() => setSelectedThreadId(null)}
      />
    </div>
  );
}

function ThreadsView({
  data,
  isLoading,
  error,
  onPick,
}: {
  data?: ThreadsResponse;
  isLoading: boolean;
  error: unknown;
  onPick: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 size={16} strokeWidth={1.75} className="mr-2 animate-spin" />
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-destructive">
        {error instanceof ApiCallError ? error.message : "Failed to load threads"}
      </div>
    );
  }
  if (!data || data.threads.length === 0) {
    return <AuditEmptyState kind="threads" />;
  }
  return (
    <div className="rounded-lg border bg-card">
      <ul className="divide-y">
        {data.threads.map((t) => (
          <li
            key={t.id}
            className="cursor-pointer px-4 py-3 hover:bg-secondary/40"
            onClick={() => onPick(t.id)}
          >
            <div className="flex items-center gap-3">
              <MessageSquare
                size={14}
                strokeWidth={1.75}
                className="text-muted-foreground"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {t.topic ?? "(untitled thread)"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t.messageCount ?? 0} messages ·{" "}
                  {new Date(t.createdAt).toLocaleString()}
                </div>
              </div>
              {t.relatedTaskId ? (
                <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-mono">
                  task
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LogView({
  data,
  isLoading,
  error,
}: {
  data?: AuditLogResponse;
  isLoading: boolean;
  error: unknown;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 size={16} strokeWidth={1.75} className="mr-2 animate-spin" />
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-destructive">
        {error instanceof ApiCallError ? error.message : "Failed to load log"}
      </div>
    );
  }
  if (!data || data.entries.length === 0) {
    return <AuditEmptyState kind="log" />;
  }
  return (
    <div className="rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Time</th>
            <th className="px-4 py-2 font-medium">Actor</th>
            <th className="px-4 py-2 font-medium">Action</th>
            <th className="px-4 py-2 font-medium">Resource</th>
          </tr>
        </thead>
        <tbody>
          {data.entries.map((e) => (
            <tr key={e.id} className="border-b last:border-0 hover:bg-secondary/40">
              <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                {new Date(e.createdAt).toLocaleString()}
              </td>
              <td className="px-4 py-2">
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] capitalize">
                  {e.actorType}
                </span>
              </td>
              <td className="px-4 py-2 font-mono text-xs">{e.action}</td>
              <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                {e.resourceType ?? "—"}
                {e.resourceId ? ` ${e.resourceId.slice(0, 8)}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditEmptyState({ kind }: { kind: "threads" | "log" }) {
  return (
    <EmptyState
      Icon={History}
      title="Nothing yet"
      description={
        kind === "threads"
          ? "No A2A threads in this org yet. They'll appear here as agents start collaborating."
          : "No audit entries yet. Every state change in the system is recorded here."
      }
    />
  );
}

void Download;
void useMemo;
