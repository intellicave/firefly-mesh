"use client";

// /organization — per ui.md §4.2.
// Default view: xyflow + Dagre force-directed graph.
// Toggle: Graph / List. Toolbar: search + dept filter + refresh.
// Click any node → AgentDetailDrawer (Profile / Agent / Boundary tabs).

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  LayoutGrid,
  Loader2,
  Network,
  RefreshCw,
  Search,
  User,
} from "lucide-react";

import { api, ApiCallError } from "@/lib/api-client";
import { AgentDetailDrawer } from "@/components/organization/agent-detail-drawer";
import {
  OrgGraph as OrgGraphView,
  type OrgEmployee,
  type OrgAgent,
  type OrgDepartment,
  type OrgDepartmentMember,
} from "@/components/organization/org-graph";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface OrgGraphPayload {
  employees: OrgEmployee[];
  departments: OrgDepartment[];
  departmentMembers: OrgDepartmentMember[];
  projects: Array<unknown>;
  projectMembers: Array<unknown>;
  agents: OrgAgent[];
}

interface MeResponse {
  employee: { id: string; role: string };
}

type ViewMode = "graph" | "list";

export default function OrganizationPage() {
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeResponse>("/api/me"),
  });
  const orgQuery = useQuery({
    queryKey: ["org-graph"],
    queryFn: () => api<OrgGraphPayload>("/api/org/graph"),
  });

  const [view, setView] = useState<ViewMode>("graph");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDeptId, setFilterDeptId] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null,
  );

  const canEditBoundary =
    meQuery.data?.employee.role === "owner" ||
    meQuery.data?.employee.role === "admin";

  // Filter employees by search term (graph view only — list view filters internally)
  const filteredEmployees = useMemo(() => {
    if (!orgQuery.data) return [];
    const q = searchTerm.trim().toLowerCase();
    if (!q) return orgQuery.data.employees;
    return orgQuery.data.employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.title?.toLowerCase().includes(q) ?? false),
    );
  }, [orgQuery.data, searchTerm]);

  const grouped = useMemo(() => {
    if (!orgQuery.data) return null;
    const data = orgQuery.data;
    const empById = new Map(data.employees.map((e) => [e.id, e]));
    const agentByOwner = new Map(
      data.agents.map((a) => [a.ownerEmployeeId, a]),
    );
    return { empById, agentByOwner, data };
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
    <div className="flex h-full flex-col">
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

      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b bg-card/40 px-6 py-2">
        <div className="flex flex-1 items-center gap-2">
          <div className="flex h-8 max-w-xs flex-1 items-center gap-1.5 rounded-md border bg-background px-2">
            <Search size={12} strokeWidth={1.75} className="text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name / email / title…"
              className="h-full flex-1 bg-transparent text-xs focus:outline-none"
            />
          </div>

          <select
            value={filterDeptId ?? ""}
            onChange={(e) => setFilterDeptId(e.target.value || null)}
            disabled={!orgQuery.data || orgQuery.data.departments.length === 0}
            className="h-8 rounded-md border bg-background px-2 text-xs disabled:opacity-50"
          >
            <option value="">All departments</option>
            {(orgQuery.data?.departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ["org-graph"] })
            }
            className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-2 text-xs hover:bg-secondary"
          >
            <RefreshCw
              size={12}
              strokeWidth={1.75}
              className={cn(orgQuery.isFetching && "animate-spin")}
            />
            Refresh
          </button>
        </div>

        <div className="inline-flex h-8 items-center rounded-md border bg-background p-0.5">
          <ViewToggle
            active={view === "graph"}
            onClick={() => setView("graph")}
            Icon={Network}
            label="Graph"
          />
          <ViewToggle
            active={view === "list"}
            onClick={() => setView("list")}
            Icon={LayoutGrid}
            label="List"
          />
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {orgQuery.isLoading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 size={20} className="mr-2 animate-spin" />
            Loading mesh…
          </div>
        ) : orgQuery.error ? (
          <div className="p-6">
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {orgQuery.error instanceof ApiCallError
                ? orgQuery.error.message
                : "Failed to load org"}
            </p>
          </div>
        ) : orgQuery.data && orgQuery.data.employees.length === 0 ? (
          <EmployeesEmptyState canManage={canEditBoundary} />
        ) : grouped ? (
          view === "graph" ? (
            <OrgGraphView
              employees={filteredEmployees}
              agents={grouped.data.agents}
              departments={grouped.data.departments}
              departmentMembers={grouped.data.departmentMembers}
              filterDepartmentId={filterDeptId}
              onSelect={(id) => setSelectedEmployeeId(id)}
            />
          ) : (
            <div className="h-full overflow-y-auto p-6">
              <OrgGroupedList
                data={grouped.data}
                agentByOwner={grouped.agentByOwner}
                searchTerm={searchTerm}
                filterDeptId={filterDeptId}
                onSelect={(id) => setSelectedEmployeeId(id)}
              />
            </div>
          )
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

function ViewToggle({
  active,
  onClick,
  Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof Network;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded px-2 text-xs",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon size={12} strokeWidth={1.75} />
      {label}
    </button>
  );
}

function EmployeesEmptyState({ canManage }: { canManage: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
      <Network size={20} strokeWidth={1.5} className="text-primary" />
      <h2 className="font-serif text-base text-foreground">No employees yet</h2>
      <p className="max-w-md text-sm">
        Your organization is empty. Import employees from a CSV to get started.
      </p>
      {canManage ? (
        <a
          href="/onboarding/import"
          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <User size={12} strokeWidth={1.75} />
          Import employees
        </a>
      ) : null}
    </div>
  );
}

function OrgGroupedList({
  data,
  agentByOwner,
  searchTerm,
  filterDeptId,
  onSelect,
}: {
  data: OrgGraphPayload;
  agentByOwner: Map<string, OrgAgent>;
  searchTerm: string;
  filterDeptId: string | null;
  onSelect: (id: string) => void;
}) {
  const empToDepts = new Map<string, string[]>();
  for (const m of data.departmentMembers) {
    const list = empToDepts.get(m.employeeId) ?? [];
    list.push(m.departmentId);
    empToDepts.set(m.employeeId, list);
  }

  const q = searchTerm.trim().toLowerCase();
  const matches = (e: OrgEmployee) =>
    !q ||
    e.name.toLowerCase().includes(q) ||
    e.email.toLowerCase().includes(q) ||
    (e.title?.toLowerCase().includes(q) ?? false);

  const groupsByDept = new Map<string, OrgEmployee[]>();
  const unassigned: OrgEmployee[] = [];
  for (const emp of data.employees) {
    if (!matches(emp)) continue;
    const deptIds = empToDepts.get(emp.id) ?? [];
    if (deptIds.length === 0) {
      if (!filterDeptId) unassigned.push(emp);
      continue;
    }
    for (const did of deptIds) {
      if (filterDeptId && filterDeptId !== did) continue;
      const list = groupsByDept.get(did) ?? [];
      list.push(emp);
      groupsByDept.set(did, list);
    }
  }

  const visibleDepts = filterDeptId
    ? data.departments.filter((d) => d.id === filterDeptId)
    : data.departments;

  return (
    <div className="space-y-6">
      {visibleDepts.map((dept) => {
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

      {unassigned.length > 0 && !filterDeptId ? (
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

function EmployeeCard({
  employee,
  agent,
  onClick,
}: {
  employee: OrgEmployee;
  agent: OrgAgent | undefined;
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
