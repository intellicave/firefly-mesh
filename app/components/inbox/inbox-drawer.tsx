"use client";

// Inbox drawer — full message detail + sticky Approve/Reject footer.
//
// Sprint A: hub has no GET /api/a2a-messages/:id endpoint and inbox-list rows
// already carry every field we'd reasonably fetch (summary, sender/receiver
// names, threadId, type). We pass the selected item in as a prop and skip the
// detail fetch — body content is encrypted in messages_meta and not exposed
// via hub APIs anyway, so a re-fetch would only repeat what we already have.

import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { InboxItem } from "@/components/inbox/inbox-row";

interface DrawerProps {
  selected: InboxItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: () => void;
  onReject: () => void;
  busy?: boolean;
}

export function InboxDrawer({
  selected,
  open,
  onOpenChange,
  onApprove,
  onReject,
  busy,
}: DrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[480px] flex-col gap-0 p-0 sm:max-w-[480px]">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="text-base">
            {selected?.kind === "task_review" ? "Task review" : "A2A message"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {!selected ? null : selected.kind === "task_review" ? (
            <p className="text-sm text-muted-foreground">
              Task #{selected.id} pending your review. Approve or reject below;
              free-text comment input lands in the next polish sprint.
            </p>
          ) : (
            <MessageDetailView item={selected} />
          )}
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

function MessageDetailView({ item }: { item: InboxItem }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3">
        <div className="text-xs text-muted-foreground">Counterpart</div>
        <div className="text-sm font-medium">
          {item.counterpartName ?? "(unknown)"}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
          Summary
        </h3>
        <p className="text-sm">{item.summary}</p>
        <p className="text-xs text-muted-foreground">
          Hub does not expose decrypted message body via REST in sprint A —
          summary above is the metadata-side preview. Full body is end-to-end
          encrypted in messages_meta and only visible to the receiving agent.
        </p>
      </div>

      {item.relatedTaskId ? (
        <div className="rounded-lg border bg-muted/40 p-3">
          <div className="text-xs text-muted-foreground">Linked task</div>
          <code className="font-mono text-xs">{item.relatedTaskId}</code>
        </div>
      ) : null}

      <div className="space-y-1">
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
          Type
        </h3>
        <Badge variant="outline" className="text-[10px]">
          {item.type}
        </Badge>
      </div>
    </div>
  );
}
