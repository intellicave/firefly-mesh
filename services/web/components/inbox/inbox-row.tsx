"use client";

// Single inbox row. Displays type pill + sender→receiver + summary +
// quick action buttons. Click anywhere on the row → opens drawer.

import {
  CircleAlert,
  CircleCheck,
  CircleX,
  Handshake,
  HandCoins,
  Info,
  RefreshCw,
  Shield,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface InboxItem {
  kind: "a2a" | "task_review";
  id: string;
  type: string;
  summary: string;
  createdAt: string | Date;
  threadId: string | null;
  relatedTaskId: string | null;
  senderAgentId: string | null;
  counterpartName: string | null;
}

const TYPE_META: Record<
  string,
  { label: string; tone: "blue" | "amber" | "red" | "green"; Icon: typeof Info }
> = {
  inform: { label: "inform", tone: "blue", Icon: Info },
  sync: { label: "sync", tone: "blue", Icon: RefreshCw },
  request: { label: "request", tone: "amber", Icon: HandCoins },
  commit: { label: "commit", tone: "amber", Icon: Handshake },
  handoff: { label: "handoff", tone: "amber", Icon: Handshake },
  escalate: { label: "escalate", tone: "red", Icon: CircleAlert },
  block: { label: "block", tone: "red", Icon: Shield },
  review: { label: "review", tone: "green", Icon: CircleCheck },
};

function relativeTime(date: string | Date): string {
  const d = new Date(date).getTime();
  const diff = Date.now() - d;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function InboxRow({
  item,
  active,
  onClick,
  onApprove,
  onReject,
  busy,
}: {
  item: InboxItem;
  active?: boolean;
  onClick: () => void;
  onApprove: () => void;
  onReject: () => void;
  busy?: boolean;
}) {
  const meta = TYPE_META[item.type] ?? TYPE_META.inform!;
  const { Icon } = meta;
  const toneClass =
    meta.tone === "amber"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : meta.tone === "red"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : meta.tone === "green"
          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
          : "border-blue-300 bg-blue-50 text-blue-900";

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "flex cursor-pointer items-center gap-3 border-b px-4 py-3 transition-colors",
        active ? "bg-secondary" : "hover:bg-secondary/50",
      )}
    >
      <Badge
        variant="outline"
        className={cn("shrink-0 gap-1 px-1.5 py-0.5 text-[11px]", toneClass)}
      >
        <Icon size={12} strokeWidth={1.75} />
        {meta.label}
      </Badge>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{item.summary}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {item.kind === "task_review"
            ? "Task review requested"
            : item.counterpartName
              ? `with ${item.counterpartName}`
              : ""}
          {" · "}
          {relativeTime(item.createdAt)}
        </div>
      </div>

      <div
        className="flex shrink-0 items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onApprove}
          disabled={busy}
          aria-label="Approve"
          className="rounded-md p-1.5 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
        >
          <CircleCheck size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          aria-label="Reject"
          className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-40"
        >
          <CircleX size={16} strokeWidth={1.75} />
        </button>
      </div>
    </li>
  );
}
