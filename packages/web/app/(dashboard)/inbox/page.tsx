"use client";

// Real Inbox page — per ui.md §4.1.
// Two tabs (approve / action) + filter / sort toolbar + drawer + Load earlier pagination.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Inbox as InboxIcon,
  Loader2,
} from "lucide-react";

import { api, ApiCallError } from "@/lib/api-client";
import { InboxRow, type InboxItem } from "@/components/inbox/inbox-row";
import { InboxDrawer } from "@/components/inbox/inbox-drawer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface InboxResponse {
  tab: "approve" | "action";
  items: InboxItem[];
  nextCursor: string | null;
}

interface EmployeeRow {
  id: string;
  name: string;
}

type Tab = "approve" | "action";
type SortDir = "desc" | "asc";

const MESSAGE_TYPES = [
  "inform",
  "sync",
  "request",
  "commit",
  "handoff",
  "escalate",
  "block",
] as const;

export default function InboxPage() {
  const [tab, setTab] = useState<Tab>("approve");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [counterpartFilter, setCounterpartFilter] = useState<string>("");
  const [sort, setSort] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [pages, setPages] = useState<InboxItem[][]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const queryKey = useMemo(
    () => ["a2a-inbox", tab, typeFilter, counterpartFilter, sort],
    [tab, typeFilter, counterpartFilter, sort],
  );

  const inbox = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams({ tab, sort });
      if (typeFilter) params.set("type", typeFilter);
      if (counterpartFilter) params.set("counterpart", counterpartFilter);
      return api<InboxResponse>(`/api/a2a/inbox?${params.toString()}`).then(
        (data) => {
          setPages([data.items]);
          setNextCursor(data.nextCursor);
          return data;
        },
      );
    },
    refetchInterval: 15_000,
  });

  // Other-tab counts
  const otherTab: Tab = tab === "approve" ? "action" : "approve";
  const otherInbox = useQuery({
    queryKey: ["a2a-inbox-count", otherTab],
    queryFn: () => api<InboxResponse>(`/api/a2a/inbox?tab=${otherTab}`),
    refetchInterval: 15_000,
  });

  // Roster of employees in this org for the counterpart filter dropdown
  const employees = useQuery({
    queryKey: ["employees-list"],
    queryFn: () => api<EmployeeRow[]>("/api/employee?limit=500"),
    staleTime: 60_000,
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

  const loadEarlier = useMutation({
    mutationFn: async () => {
      if (!nextCursor) return null;
      const params = new URLSearchParams({ tab, sort, cursor: nextCursor });
      if (typeFilter) params.set("type", typeFilter);
      if (counterpartFilter) params.set("counterpart", counterpartFilter);
      return api<InboxResponse>(`/api/a2a/inbox?${params.toString()}`);
    },
    onSuccess: (data) => {
      if (!data) return;
      setPages((prev) => [...prev, data.items]);
      setNextCursor(data.nextCursor);
    },
  });

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
      void queryClient.invalidateQueries({ queryKey: ["a2a-inbox-count"] });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      setSelected(null);
    },
  });

  const allItems = pages.flat();
  const filtersActive = Boolean(typeFilter || counterpartFilter);

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
          setPages([]);
          setNextCursor(null);
        }}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <TabsList className="mx-6 mt-4 grid w-fit grid-cols-2">
          <TabsTrigger value="approve">
            Pending send ({counts.approve})
          </TabsTrigger>
          <TabsTrigger value="action">
            Pending action ({counts.action})
          </TabsTrigger>
        </TabsList>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-6 pt-3">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            <option value="">All types</option>
            {MESSAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={counterpartFilter}
            onChange={(e) => setCounterpartFilter(e.target.value)}
            disabled={!employees.data || employees.data.length === 0}
            className="h-8 rounded-md border bg-background px-2 text-xs disabled:opacity-50"
          >
            <option value="">
              {tab === "approve" ? "Any receiver" : "Any sender"}
            </option>
            {(employees.data ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setSort((s) => (s === "desc" ? "asc" : "desc"))}
            className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-2 text-xs hover:bg-secondary"
            aria-label={`Sort ${sort === "desc" ? "newest first" : "oldest first"}`}
          >
            {sort === "desc" ? (
              <ArrowDown size={12} strokeWidth={1.75} />
            ) : (
              <ArrowUp size={12} strokeWidth={1.75} />
            )}
            {sort === "desc" ? "Newest" : "Oldest"}
          </button>

          {filtersActive ? (
            <button
              type="button"
              onClick={() => {
                setTypeFilter("");
                setCounterpartFilter("");
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {(["approve", "action"] as const).map((t) => (
          <TabsContent
            key={t}
            value={t}
            className="flex-1 overflow-y-auto px-6 pb-6 pt-3"
          >
            <div className="rounded-lg border bg-card">
              {inbox.isLoading && tab === t && pages.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2
                    size={16}
                    strokeWidth={1.75}
                    className="mr-2 animate-spin"
                  />
                  Loading…
                </div>
              ) : inbox.error && tab === t ? (
                <div className="p-6 text-sm text-destructive">
                  {inbox.error instanceof ApiCallError
                    ? inbox.error.message
                    : "Failed to load inbox"}
                </div>
              ) : tab === t && allItems.length === 0 ? (
                <EmptyState tab={t} filtersActive={filtersActive} />
              ) : tab === t ? (
                <>
                  <ul>
                    {allItems.map((item) => (
                      <InboxRow
                        key={`${item.kind}-${item.id}`}
                        item={item}
                        active={selected?.id === item.id}
                        onClick={() => setSelected(item)}
                        onApprove={() =>
                          action.mutate({ item, verb: "approve" })
                        }
                        onReject={() =>
                          action.mutate({ item, verb: "reject" })
                        }
                        busy={action.isPending}
                      />
                    ))}
                  </ul>

                  {nextCursor ? (
                    <div className="border-t p-3 text-center">
                      <button
                        type="button"
                        onClick={() => loadEarlier.mutate()}
                        disabled={loadEarlier.isPending}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-secondary",
                          loadEarlier.isPending && "opacity-50",
                        )}
                      >
                        {loadEarlier.isPending ? (
                          <>
                            <Loader2
                              size={12}
                              strokeWidth={1.75}
                              className="animate-spin"
                            />
                            Loading…
                          </>
                        ) : (
                          <>↑ Load earlier</>
                        )}
                      </button>
                    </div>
                  ) : null}
                </>
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

function EmptyState({
  tab,
  filtersActive,
}: {
  tab: Tab;
  filtersActive: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center text-muted-foreground">
      <InboxIcon size={20} strokeWidth={1.5} className="text-primary" />
      <h2 className="font-serif text-base text-foreground">
        {filtersActive ? "No matches" : "Nothing pending"}
      </h2>
      <p className="max-w-md text-sm">
        {filtersActive
          ? "No items match your filters. Try clearing them."
          : tab === "approve"
            ? "Your agent has no messages waiting for your approval to send."
            : "No incoming requests or task reviews need your action."}
      </p>
    </div>
  );
}
