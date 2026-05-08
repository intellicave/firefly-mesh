"use client";

// Inbox drawer — full message detail + sticky Approve/Reject footer.
// Per ui §4.1.

import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { api, ApiCallError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface MessageDetail {
  id: string;
  threadId: string;
  type: string;
  content: { summary: string; body?: string; structured?: unknown };
  createdAt: string;
  relatedTaskId: string | null;
  senderApprovalStatus: string;
  senderApprovalAt: string | null;
  receiverActionStatus: string;
  receiverActionAt: string | null;
  senderEmployeeId: string;
  senderEmployeeName: string;
  senderEmployeeTitle: string | null;
  senderAgentId: string;
  senderAgentRuntime: string;
  receiverEmployeeId: string;
  receiverEmployeeName: string;
  receiverEmployeeTitle: string | null;
  receiverAgentId: string;
  receiverAgentRuntime: string;
}

interface DrawerProps {
  /** A2A message id, or task id when kind='task_review'. */
  selectedId: string | null;
  selectedKind: "a2a" | "task_review" | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: () => void;
  onReject: () => void;
  busy?: boolean;
}

export function InboxDrawer({
  selectedId,
  selectedKind,
  open,
  onOpenChange,
  onApprove,
  onReject,
  busy,
}: DrawerProps) {
  const detail = useQuery({
    queryKey: ["a2a", selectedId],
    queryFn: () => api<MessageDetail>(`/api/a2a/${selectedId}`),
    enabled: open && Boolean(selectedId) && selectedKind === "a2a",
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[480px] flex-col gap-0 p-0 sm:max-w-[480px]">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="text-base">
            {selectedKind === "task_review" ? "Task review" : "A2A message"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {selectedKind === "task_review" ? (
            <p className="text-sm text-muted-foreground">
              Task #{selectedId} pending your review. Approve or reject below;
              optionally include a comment via the API for now (UI form
              coming in M3 polish).
            </p>
          ) : detail.isLoading ? (
            <Loader2 size={16} strokeWidth={1.75} className="animate-spin text-primary" />
          ) : detail.error ? (
            <p className="text-sm text-destructive">
              {detail.error instanceof ApiCallError
                ? detail.error.message
                : "Failed to load message"}
            </p>
          ) : detail.data ? (
            <MessageDetailView msg={detail.data} />
          ) : null}
        </div>

        <footer className="flex gap-2 border-t bg-card p-3">
          <Button
            type="button"
            className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={onApprove}
            disabled={busy}
          >
            {busy ? (
              <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
            ) : null}
            Approve (A)
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="flex-1"
            onClick={onReject}
            disabled={busy}
          >
            Reject (R)
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}

function MessageDetailView({ msg }: { msg: MessageDetail }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3">
        <div className="text-xs text-muted-foreground">From</div>
        <div className="font-medium text-sm">
          {msg.senderEmployeeName}
          {msg.senderEmployeeTitle ? (
            <span className="ml-1 text-muted-foreground">
              · {msg.senderEmployeeTitle}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {msg.senderAgentRuntime}
        </div>
      </div>

      <div className="rounded-lg border p-3">
        <div className="text-xs text-muted-foreground">To</div>
        <div className="font-medium text-sm">
          {msg.receiverEmployeeName}
          {msg.receiverEmployeeTitle ? (
            <span className="ml-1 text-muted-foreground">
              · {msg.receiverEmployeeTitle}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {msg.receiverAgentRuntime}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
          Content
        </h3>
        <p className="text-sm font-medium">{msg.content.summary}</p>
        {msg.content.body ? (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {msg.content.body}
          </p>
        ) : null}
      </div>

      {msg.relatedTaskId ? (
        <div className="rounded-lg border bg-muted/40 p-3">
          <div className="text-xs text-muted-foreground">Linked task</div>
          <code className="text-xs font-mono">{msg.relatedTaskId}</code>
        </div>
      ) : null}

      <div className="space-y-1">
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
          State
        </h3>
        <div className="grid grid-cols-2 gap-1 text-xs">
          <span className="text-muted-foreground">Sender approval</span>
          <Badge variant="outline" className="justify-self-start text-[10px]">
            {msg.senderApprovalStatus}
          </Badge>
          <span className="text-muted-foreground">Receiver action</span>
          <Badge variant="outline" className="justify-self-start text-[10px]">
            {msg.receiverActionStatus}
          </Badge>
        </div>
      </div>
    </div>
  );
}
