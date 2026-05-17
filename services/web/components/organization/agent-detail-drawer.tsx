"use client";

// 3-tab drawer per ui §4.2 — Profile / Agent / Boundary.
// Trimmed from firefly's 8-tab version; V2 fields (skills/prompt/memory/
// artifacts) explicitly omitted.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { api, ApiCallError } from "@/lib/api-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface EmployeeNode {
  id: string;
  name: string;
  email: string;
  title: string | null;
  avatarUrl: string | null;
  role: "owner" | "admin" | "manager" | "employee" | "auditor";
  status: "active" | "archived";
}

interface AgentNode {
  id: string;
  ownerEmployeeId: string;
  runtimeKind: string;
  runtimeMeta: { version?: string; protocolVersion?: string } | null;
  status: "inactive" | "active" | "archived";
  lastSeenAt: string | null;
}

interface BoundaryResponse {
  agentId: string;
  scopes: string[];
  updatedAt: string | null;
}

const SCOPE_OPTIONS = [
  { id: "read_kb", label: "Read knowledge base" },
  { id: "write_kb_personal", label: "Write personal KB" },
  { id: "submit_task", label: "Submit task completion" },
  { id: "send_a2a_inform", label: "Send A2A inform" },
  { id: "send_a2a_request", label: "Send A2A request (HITL)" },
  { id: "send_a2a_commit", label: "Send A2A commit (HITL)" },
  { id: "send_a2a_handoff", label: "Send A2A handoff (HITL)" },
  { id: "dispatch_task", label: "Dispatch tasks (CEO/manager)" },
  { id: "send_external_email", label: "Send external email", danger: true },
  { id: "sign_contract", label: "Sign contract", danger: true },
] as const;

interface DrawerProps {
  employee: EmployeeNode | null;
  agent: AgentNode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Allow boundary edits (admin/owner). */
  canEditBoundary: boolean;
}

export function AgentDetailDrawer({
  employee,
  agent,
  open,
  onOpenChange,
  canEditBoundary,
}: DrawerProps) {
  const queryClient = useQueryClient();
  const initials = useMemo(
    () =>
      employee?.name
        .split(/\s+/)
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase() ?? "",
    [employee?.name],
  );

  const boundaryQuery = useQuery({
    queryKey: ["boundary", agent?.id],
    // Sprint A: v0 /api/boundary → hub /api/boundaries.
    queryFn: () =>
      api<BoundaryResponse>(`/api/boundaries/${agent!.id}`),
    enabled: open && Boolean(agent?.id),
  });

  const [scopes, setScopes] = useState<string[]>([]);
  useEffect(() => {
    if (boundaryQuery.data) setScopes(boundaryQuery.data.scopes);
  }, [boundaryQuery.data]);

  const updateBoundary = useMutation({
    mutationFn: () =>
      api(`/api/boundaries/${agent!.id}`, {
        method: "PUT",
        body: { scopes },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["boundary", agent?.id] });
      void queryClient.invalidateQueries({ queryKey: ["org-graph"] });
    },
  });

  // Sprint A: v0 /api/token/regenerate?employeeId=...  →  hub flow is
  //   1. GET /api/agent-tokens                    (list tenant tokens)
  //   2. find latest pending for this employee
  //      ├─ if exists → POST /api/agent-tokens/:id/regenerate
  //      └─ if none   → POST /api/agent-tokens { employeeId, expiresIn }
  // returns { id, plainToken } for the new token.
  const regenerateToken = useMutation({
    mutationFn: async () => {
      const list = await api<
        Array<{
          id: string;
          employeeId: string;
          status: "pending" | "consumed" | "revoked" | "expired";
        }>
      >("/api/agent-tokens");
      const pending = list.find(
        (t) => t.employeeId === employee!.id && t.status === "pending",
      );
      if (pending) {
        return api<{ id: string; plainToken: string }>(
          `/api/agent-tokens/${pending.id}/regenerate`,
          { method: "POST", body: {} },
        );
      }
      return api<{ id: string; plainToken: string }>("/api/agent-tokens", {
        method: "POST",
        body: { employeeId: employee!.id, expiresIn: "7d" },
      });
    },
  });

  function toggleScope(id: string) {
    setScopes((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  if (!employee) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[480px] flex-col gap-0 p-0 sm:max-w-[480px]">
        <SheetHeader className="border-b p-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              {employee.avatarUrl ? (
                <AvatarImage src={employee.avatarUrl} alt={employee.name} />
              ) : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base">{employee.name}</SheetTitle>
              <div className="text-xs text-muted-foreground">
                {employee.title ?? "—"}
              </div>
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="profile" className="flex flex-1 flex-col">
          <TabsList className="mx-4 mt-3 grid w-[calc(100%-2rem)] grid-cols-3">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="agent">Agent</TabsTrigger>
            <TabsTrigger value="boundary">Boundary</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="flex-1 overflow-y-auto p-4">
            <dl className="grid grid-cols-3 gap-y-3 text-sm">
              <dt className="col-span-1 text-muted-foreground">Title</dt>
              <dd className="col-span-2">{employee.title ?? "—"}</dd>
              <dt className="col-span-1 text-muted-foreground">Email</dt>
              <dd className="col-span-2 font-mono text-xs">{employee.email}</dd>
              <dt className="col-span-1 text-muted-foreground">Role</dt>
              <dd className="col-span-2 capitalize">{employee.role}</dd>
              <dt className="col-span-1 text-muted-foreground">Status</dt>
              <dd className="col-span-2">
                <Badge variant={employee.status === "active" ? "default" : "outline"}>
                  {employee.status}
                </Badge>
              </dd>
            </dl>
          </TabsContent>

          <TabsContent value="agent" className="flex-1 overflow-y-auto p-4">
            {agent ? (
              <dl className="grid grid-cols-3 gap-y-3 text-sm">
                <dt className="col-span-1 text-muted-foreground">Runtime</dt>
                <dd className="col-span-2">
                  <Badge variant="outline" className="capitalize">
                    {agent.runtimeKind}
                  </Badge>
                </dd>
                <dt className="col-span-1 text-muted-foreground">Version</dt>
                <dd className="col-span-2 font-mono text-xs">
                  {agent.runtimeMeta?.version ?? "—"}
                </dd>
                <dt className="col-span-1 text-muted-foreground">Protocol</dt>
                <dd className="col-span-2 font-mono text-xs">
                  {agent.runtimeMeta?.protocolVersion ?? "—"}
                </dd>
                <dt className="col-span-1 text-muted-foreground">Status</dt>
                <dd className="col-span-2">
                  <Badge
                    variant={agent.status === "active" ? "default" : "outline"}
                  >
                    ● {agent.status}
                  </Badge>
                </dd>
                <dt className="col-span-1 text-muted-foreground">Last seen</dt>
                <dd className="col-span-2 text-xs">
                  {agent.lastSeenAt
                    ? new Date(agent.lastSeenAt).toLocaleString()
                    : "Never"}
                </dd>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                Employee has not connected an agent yet. Generate an access
                token in the Token settings panel.
              </p>
            )}

            {employee.role !== "auditor" ? (
              <div className="mt-6 rounded-lg border bg-muted/40 p-3">
                <h3 className="text-sm font-medium">Access token</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Regenerating revokes any pending tokens. Existing active
                  agent will be set to inactive and must reactivate.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  disabled={regenerateToken.isPending}
                  onClick={() => regenerateToken.mutate()}
                >
                  {regenerateToken.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : null}
                  Regenerate token
                </Button>
                {regenerateToken.data ? (
                  <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs">
                    <div className="font-medium text-amber-900">
                      Save this token now — shown only once:
                    </div>
                    <code className="mt-1 block break-all font-mono text-[11px]">
                      {regenerateToken.data.plainToken}
                    </code>
                  </div>
                ) : null}
                {regenerateToken.error ? (
                  <p className="mt-2 text-xs text-destructive">
                    {regenerateToken.error instanceof ApiCallError
                      ? regenerateToken.error.message
                      : "Regenerate failed"}
                  </p>
                ) : null}
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="boundary" className="flex-1 overflow-y-auto p-4">
            {!agent ? (
              <p className="text-sm text-muted-foreground">
                No agent activated yet — boundary scopes apply once the agent
                connects.
              </p>
            ) : boundaryQuery.isLoading ? (
              <Loader2 size={16} className="animate-spin text-primary" />
            ) : (
              <div className="space-y-2">
                {SCOPE_OPTIONS.map((opt) => {
                  const checked = scopes.includes(opt.id);
                  const danger = "danger" in opt && opt.danger === true;
                  return (
                    <label
                      key={opt.id}
                      className="flex items-start gap-2 rounded-md border p-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!canEditBoundary}
                        onChange={() => toggleScope(opt.id)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className={danger ? "text-destructive" : ""}>
                          {opt.label}
                          {danger ? (
                            <Badge variant="destructive" className="ml-2 text-[10px]">
                              danger
                            </Badge>
                          ) : null}
                        </div>
                        <code className="text-[10px] text-muted-foreground">
                          {opt.id}
                        </code>
                      </div>
                    </label>
                  );
                })}
                {canEditBoundary ? (
                  <Button
                    className="mt-2 w-full"
                    onClick={() => updateBoundary.mutate()}
                    disabled={updateBoundary.isPending}
                  >
                    {updateBoundary.isPending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : null}
                    Save scopes
                  </Button>
                ) : null}
                {updateBoundary.error ? (
                  <p className="text-xs text-destructive">
                    {updateBoundary.error instanceof ApiCallError
                      ? updateBoundary.error.message
                      : "Save failed"}
                  </p>
                ) : null}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
