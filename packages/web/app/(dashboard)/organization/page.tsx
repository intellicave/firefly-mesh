"use client";

// /organization — M2 baseline view: grouped list by department.
// Click any employee row → AgentDetailDrawer (3 tabs).
// xyflow + Dagre graph rendering deferred to next iteration; the
// underlying API (/api/org/graph) returns the same payload either way,
// so swapping to graph view is purely a UI concern.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Loader2, User } from "lucide-react";

import { api, ApiCallError } from "@/lib/api-client";
import { AgentDetailDrawer } from "@/components/organization/agent-detail-drawer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface OrgGraph {
  employees: Array<{
    id: string;
    userId: string | null;
    name: string;
    email: string;
    title: string | null;
    avatarUrl: string | null;
    role: "owner" | "admin" | "manager" | "employee" | "auditor";
    status: "active" | "archived";
  }>;
  departments: Array<{
    id: string;
    parentId: string | null;
    name: string;
    description: string | null;
  }>;
  departmentMembers: Array<{
    departmentId: string;
    employeeId: string;
    role: string | null;
  }>;
  projects: Array<unknown>;
  projectMembers: Array<unknown>;
  agents: Array<{
    id: string;
    ownerEmployeeId: string;
    runtimeKind: string;
    runtimeMeta: { version?: string; protocolVersion?: string } | null;
    status: "inactive" | "active" | "archived";
    lastSeenAt: string | null;
  }>;
}

interface MeResponse {
  employee: { id: string; role: string };
}

export default function OrganizationPage() {
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeResponse>("/api/me"),
  });
  const orgQuery = useQuery({
    queryKey: ["org-graph"],
    queryFn: () => api<OrgGraph>("/api/org/graph"),
  });

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null,
  );

  const canEditBoundary =
    meQuery.data?.employee.role === "owner" ||
    meQuery.data?.employee.role === "admin";

  const grouped = useMemo(() => {
    if (!orgQuery.data) return null;
    const data = orgQuery.data;
    const empById = new Map(data.employees.map((e) => [e.id, e]));
    const agentByOwner = new Map(
      data.agents.map((a) => [a.ownerEmployeeId, a]),
    );
    const empToDepts = new Map<string, string[]>();
    for (const m of data.departmentMembers) {
      const list = empToDepts.get(m.employeeId) ?? [];
      list.push(m.departmentId);
      empToDepts.set(m.employeeId, list);
    }

    const groupsByDept = new Map<string, typeof data.employees>();
    const unassigned: typeof data.employees = [];
    for (const emp of data.employees) {
      const deptIds = empToDepts.get(emp.id) ?? [];
      if (deptIds.length === 0) {
        unassigned.push(emp);
        continue;
      }
      for (const did of deptIds) {
        const list = groupsByDept.get(did) ?? [];
        list.push(emp);
        groupsByDept.set(did, list);
      }
    }

    return { empById, agentByOwner, groupsByDept, unassigned, data };
  }, [orgQuery.data]);

  const selectedEmployee =
    selectedEmployeeId && grouped
      ? grouped.empById.get(selectedEmployeeId) ?? null
      : null;
  const selectedAgent =
    selectedEmployeeId && grouped
      ? grouped.agentByOwner.get(selectedEmployeeId) ?? null
      : null;

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center justify-between border-b bg-card px-6">
        <h1 className="font-serif text-lg leading-tight tracking-tight">
          Organization
        </h1>
        {orgQuery.data ? (
          <div className="text-xs text-muted-foreground">
            {orgQuery.data.employees.length} employees ·{" "}
            {orgQuery.data.departments.length} departments ·{" "}
            {orgQuery.data.agents.filter((a) => a.status === "active").length}{" "}
            active agents
          </div>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {orgQuery.isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 size={20} className="mr-2 animate-spin" />
            Loading mesh…
          </div>
        ) : orgQuery.error ? (
          <p className="text-destructive">
            {orgQuery.error instanceof ApiCallError
              ? orgQuery.error.message
              : "Failed to load org"}
          </p>
        ) : grouped ? (
          <OrgGroupedList
            grouped={grouped}
            onSelect={(id) => setSelectedEmployeeId(id)}
          />
        ) : null}
      </div>

      <AgentDetailDrawer
        employee={selectedEmployee}
        agent={selectedAgent}
        open={Boolean(selectedEmployeeId)}
        onOpenChange={(o) => {
          if (!o) setSelectedEmployeeId(null);
        }}
        canEditBoundary={canEditBoundary}
      />
    </div>
  );
}

function OrgGroupedList({
  grouped,
  onSelect,
}: {
  grouped: NonNullable<ReturnType<typeof useGroupedHookFake>>;
  onSelect: (id: string) => void;
}) {
  const { data, groupsByDept, agentByOwner, unassigned } = grouped;

  return (
    <div className="space-y-6">
      {data.departments.map((dept) => {
        const employees = groupsByDept.get(dept.id) ?? [];
        return (
          <section key={dept.id} className="rounded-lg border bg-card p-4">
            <header className="mb-3 flex items-center gap-2">
              <Building2 size={14} strokeWidth={1.75} className="text-primary" />
              <h2 className="text-base font-semibold">{dept.name}</h2>
              <span className="text-xs text-muted-foreground">
                {employees.length} member{employees.length === 1 ? "" : "s"}
              </span>
            </header>
            {employees.length === 0 ? (
              <p className="text-xs text-muted-foreground">No members yet.</p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {employees.map((emp) => (
                  <EmployeeCard
                    key={emp.id}
                    employee={emp}
                    agent={agentByOwner.get(emp.id)}
                    onClick={() => onSelect(emp.id)}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {unassigned.length > 0 ? (
        <section className="rounded-lg border bg-card p-4">
          <header className="mb-3 flex items-center gap-2">
            <User size={14} strokeWidth={1.75} className="text-muted-foreground" />
            <h2 className="text-base font-semibold">Unassigned</h2>
            <span className="text-xs text-muted-foreground">
              {unassigned.length} employee
              {unassigned.length === 1 ? "" : "s"}
            </span>
          </header>
          <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {unassigned.map((emp) => (
              <EmployeeCard
                key={emp.id}
                employee={emp}
                agent={agentByOwner.get(emp.id)}
                onClick={() => onSelect(emp.id)}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

// Helper purely to satisfy TS for the OrgGroupedList prop type.
function useGroupedHookFake(): {
  empById: Map<string, OrgGraph["employees"][number]>;
  agentByOwner: Map<string, OrgGraph["agents"][number]>;
  groupsByDept: Map<string, OrgGraph["employees"]>;
  unassigned: OrgGraph["employees"];
  data: OrgGraph;
} | null {
  return null;
}

function EmployeeCard({
  employee,
  agent,
  onClick,
}: {
  employee: OrgGraph["employees"][number];
  agent: OrgGraph["agents"][number] | undefined;
  onClick: () => void;
}) {
  const initials = employee.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-md border bg-background p-3 text-left transition-colors hover:border-primary/60"
      >
        <Avatar className="size-9 shrink-0">
          {employee.avatarUrl ? (
            <AvatarImage src={employee.avatarUrl} alt={employee.name} />
          ) : null}
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{employee.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {employee.title ?? employee.email}
          </div>
        </div>
        {agent ? (
          <Badge
            variant={agent.status === "active" ? "default" : "outline"}
            className="text-[10px] capitalize"
          >
            ● {agent.status}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            no agent
          </Badge>
        )}
      </button>
    </li>
  );
}
