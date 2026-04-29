"use client";

// /inbox — heart page. M3 will build the full HITL state machine + drawer.
// This page renders a structurally complete shell so navigation works in M2;
// content will be wired to A2A messages + tasks in M3.

import { Inbox as InboxIcon } from "lucide-react";

export default function InboxPage() {
  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center border-b bg-card px-6">
        <h1 className="font-serif text-lg leading-tight tracking-tight">
          Inbox
        </h1>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
        <InboxIcon size={20} strokeWidth={1.5} className="text-primary" />
        <h2 className="font-serif text-base text-foreground">
          No pending actions
        </h2>
        <p className="max-w-md text-sm">
          When teammates' agents need your approval, or your tasks need review,
          they'll appear here.
        </p>
      </div>
    </div>
  );
}
