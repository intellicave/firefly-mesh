"use client";

// Thread detail drawer — full message timeline + audit entries.
// Privileged users see Export CSV button.

import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, X } from "lucide-react";

import { api, ApiCallError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface ThreadMessage {
  id: string;
  threadId: string;
  type: string;
  senderEmployeeId: string;
  receiverEmployeeId: string;
  content: { summary: string; body?: string };
  senderApprovalStatus: string;
  receiverActionStatus: string;
  relatedTaskId: string | null;
  createdAt: string;
}

interface AuditEntry {
  id: string;
  actorType: "human" | "agent" | "system";
  actorId: string | null;
  action: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

interface ThreadDetailResponse {
  thread: { id: string; topic: string | null };
  messages: ThreadMessage[];
  auditEntries: AuditEntry[];
}

export function ThreadDrawer({
  threadId,
  onClose,
}: {
  threadId: string | null;
  onClose: () => void;
}) {
  const open = threadId !== null;
  const detail = useQuery({
    queryKey: ["audit-thread", threadId],
    queryFn: () =>
      api<ThreadDetailResponse>(`/api/audit/threads/${threadId}`),
    enabled: open,
  });

  return (
    <Sheet open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <SheetContent side="right" className="w-[36rem] sm:max-w-[36rem]">
        <SheetHeader className="border-b pb-3">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="truncate font-serif text-base">
              {detail.data?.thread.topic ?? "Thread"}
            </SheetTitle>
            <div className="flex items-center gap-2">
              {threadId ? (
                <a
                  href={`/api/audit/threads/${threadId}/export.csv`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2 text-xs hover:bg-secondary"
                  download
                >
                  <Download size={12} strokeWidth={1.75} />
                  Export
                </a>
              ) : null}
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-md hover:bg-secondary"
                onClick={onClose}
                aria-label="Close"
              >
                <X size={14} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-4 max-h-[calc(100vh-9rem)] overflow-y-auto px-1">
          {detail.isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2
                size={16}
                strokeWidth={1.75}
                className="mr-2 animate-spin"
              />
              Loading…
            </div>
          ) : detail.error ? (
            <div className="rounded-md border bg-destructive/10 p-3 text-sm text-destructive">
              {detail.error instanceof ApiCallError
                ? detail.error.message
                : "Failed to load thread"}
            </div>
          ) : detail.data ? (
            <>
              <ol className="space-y-2">
                {detail.data.messages.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-md border bg-card p-3 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px]">
                        {m.type}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(m.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1.5 text-sm">{m.content.summary}</div>
                    {m.content.body ? (
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-muted/40 px-2 py-1.5 font-mono text-xs">
                        {m.content.body}
                      </pre>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                      <span className="rounded bg-muted/60 px-1.5 py-0.5">
                        sender: {m.senderApprovalStatus}
                      </span>
                      <span className="rounded bg-muted/60 px-1.5 py-0.5">
                        receiver: {m.receiverActionStatus}
                      </span>
                      {m.relatedTaskId ? (
                        <span className="rounded bg-muted/60 px-1.5 py-0.5">
                          task: {m.relatedTaskId.slice(0, 8)}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>

              {detail.data.auditEntries.length > 0 ? (
                <div className="mt-6">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Audit Entries
                  </div>
                  <ol className="space-y-1">
                    {detail.data.auditEntries.map((e) => (
                      <li
                        key={e.id}
                        className="rounded border bg-card px-3 py-1.5 font-mono text-xs"
                      >
                        <span className="text-muted-foreground">
                          {new Date(e.createdAt).toLocaleString()} ·{" "}
                          {e.actorType}
                        </span>{" "}
                        {e.action}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

void Button;
