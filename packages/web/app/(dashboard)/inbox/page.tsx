"use client";

// Real Inbox page — replaces the M2 placeholder.
// Two tabs (approve / action) + drawer + quick row actions.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox as InboxIcon, Loader2 } from "lucide-react";

import { api, ApiCallError } from "@/lib/api-client";
import { InboxRow, type InboxItem } from "@/components/inbox/inbox-row";
import { InboxDrawer } from "@/components/inbox/inbox-drawer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface InboxResponse {
  tab: "approve" | "action";
  items: InboxItem[];
}

type Tab = "approve" | "action";

export default function InboxPage() {
  const [tab, setTab] = useState<Tab>("approve");
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const queryClient = useQueryClient();

  const inbox = useQuery({
    queryKey: ["a2a-inbox", tab],
    queryFn: () => api<InboxResponse>(`/api/a2a/inbox?tab=${tab}`),
    refetchInterval: 15_000,
  });

  // Counts for tab badges (independent fetch of the OTHER tab to keep
  // numbers fresh — small payload, refetched same as primary)
  const otherTab: Tab = tab === "approve" ? "action" : "approve";
  const otherInbox = useQuery({
    queryKey: ["a2a-inbox", otherTab],
    queryFn: () => api<InboxResponse>(`/api/a2a/inbox?tab=${otherTab}`),
    refetchInterval: 15_000,
  });

  const counts = useMemo(
    () => ({
      approve:
        tab === "approve"
          ? (inbox.data?.items.length ?? 0)
          : (otherInbox.data?.items.length ?? 0),
      action:
        tab === "action"
          ? (inbox.data?.items.length ?? 0)
          : (otherInbox.data?.items.length ?? 0),
    }),
    [tab, inbox.data, otherInbox.data],
  );

  const action = useMutation({
    mutationFn: async (input: { item: InboxItem; verb: "approve" | "reject" }) => {
      const { item, verb } = input;
      let endpoint: string;
      let body: Record<string, unknown> | undefined;

      if (item.kind === "task_review") {
        endpoint = `/api/task/${item.id}/review`;
        body = {
          decision: verb === "approve" ? "approved" : "rejected",
        };
      } else if (tab === "approve") {
        endpoint = `/api/a2a/${item.id}/${verb}`;
      } else {
        // tab === "action" + a2a kind
        endpoint =
          verb === "approve"
            ? `/api/a2a/${item.id}/accept`
            : `/api/a2a/${item.id}/reject-receive`;
      }

      return api(endpoint, {
        method: "POST",
        body: body ?? {},
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["a2a-inbox"] });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      setSelected(null);
    },
  });

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center border-b bg-card px-6">
        <h1 className="font-serif text-lg leading-tight tracking-tight">
          Inbox
        </h1>
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as Tab);
          setSelected(null);
        }}
        className="flex flex-1 flex-col"
      >
        <TabsList className="mx-6 mt-4 grid w-fit grid-cols-2">
          <TabsTrigger value="approve">
            待我批准发送 ({counts.approve})
          </TabsTrigger>
          <TabsTrigger value="action">
            待我处理 ({counts.action})
          </TabsTrigger>
        </TabsList>

        {(["approve", "action"] as const).map((t) => (
          <TabsContent
            key={t}
            value={t}
            className="flex-1 overflow-y-auto px-6 pb-6 pt-4"
          >
            <div className="rounded-lg border bg-card">
              {inbox.isLoading && tab === t ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 size={16} strokeWidth={1.75} className="mr-2 animate-spin" />
                  Loading…
                </div>
              ) : inbox.error && tab === t ? (
                <div className="p-6 text-sm text-destructive">
                  {inbox.error instanceof ApiCallError
                    ? inbox.error.message
                    : "Failed to load inbox"}
                </div>
              ) : tab === t && (inbox.data?.items.length ?? 0) === 0 ? (
                <EmptyState tab={t} />
              ) : tab === t ? (
                <ul>
                  {(inbox.data?.items ?? []).map((item) => (
                    <InboxRow
                      key={`${item.kind}-${item.id}`}
                      item={item}
                      active={selected?.id === item.id}
                      onClick={() => setSelected(item)}
                      onApprove={() => action.mutate({ item, verb: "approve" })}
                      onReject={() => action.mutate({ item, verb: "reject" })}
                      busy={action.isPending}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <InboxDrawer
        selectedId={selected?.id ?? null}
        selectedKind={selected?.kind ?? null}
        open={Boolean(selected)}
        onOpenChange={(o) => {
          if (!o) setSelected(null);
        }}
        onApprove={() =>
          selected ? action.mutate({ item: selected, verb: "approve" }) : null
        }
        onReject={() =>
          selected ? action.mutate({ item: selected, verb: "reject" }) : null
        }
        busy={action.isPending}
      />
    </div>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center text-muted-foreground">
      <InboxIcon size={20} strokeWidth={1.5} className="text-primary" />
      <h2 className="font-serif text-base text-foreground">
        Nothing pending
      </h2>
      <p className="max-w-md text-sm">
        {tab === "approve"
          ? "Your agent has no messages waiting for your approval to send."
          : "No incoming requests or task reviews need your action."}
      </p>
    </div>
  );
}
