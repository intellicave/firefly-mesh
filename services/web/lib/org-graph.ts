// Client-side aggregation for the org-graph page. Hub has no single-call
// /api/org/graph aggregate endpoint, so we compose it from several paths
// in parallel and rebuild the shape /organization/page.tsx + the graph
// view component expect.
//
// Sprint B B.4 update: agents are now real. Hub's new GET /api/agents
// (added in B.0, commit d0e6630) returns the full tenant-wide agent
// roster in one call. Previously sprint A had to return agents=[] and
// surface a banner; the banner is now removed at organization/page.tsx.
//
//   - Department / project memberships: hub serves these via per-resource
//     endpoints (GET /api/departments/:id/members). We fan out one fetch
//     per department + per project; acceptable for V1 orgs (<10 each).
//
// Tradeoff: a few round trips vs v0's single aggregate. V1 orgs are small;
// if real load shows pain we'll add a hub /api/org/graph aggregator later.

import { api } from "@/lib/api-client";
import type {
  OrgAgent,
  OrgDepartment,
  OrgDepartmentMember,
  OrgEmployee,
} from "@/components/organization/org-graph";

interface OrgProject {
  id: string;
  name: string;
}

interface OrgProjectMember {
  projectId: string;
  employeeId: string;
}

export interface OrgGraphPayload {
  employees: OrgEmployee[];
  departments: OrgDepartment[];
  departmentMembers: OrgDepartmentMember[];
  projects: OrgProject[];
  projectMembers: OrgProjectMember[];
  agents: OrgAgent[];
}

// Hub employee role enum differs from v0 ("member" vs "employee"). We map at
// the boundary so consumers stay typed against v0's enum.
type HubEmployeeRow = Omit<OrgEmployee, "role" | "status"> & {
  role: "owner" | "admin" | "manager" | "member" | "employee" | "auditor";
  status: "active" | "archived" | "inactive";
};

function mapEmployee(row: HubEmployeeRow): OrgEmployee {
  const role: OrgEmployee["role"] =
    row.role === "member" ? "employee" : (row.role as OrgEmployee["role"]);
  const status: OrgEmployee["status"] =
    row.status === "inactive" ? "archived" : (row.status as OrgEmployee["status"]);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    title: row.title,
    avatarUrl: row.avatarUrl,
    role,
    status,
  };
}

interface MemberRow {
  // hub returns rows shaped { employee, memberRole, joinedAt }; we keep the
  // role around because v0 OrgDepartmentMember exposes it.
  employee: { id: string };
  memberRole: string | null;
}

// Hub agent row (subset of GET /api/agents response — see services/hub
// /src/routes/agents.ts, projection at the route level).
interface HubAgentRow {
  id: string;
  displayName: string;
  type: string;
  ownerEmployeeId: string | null;
  runtimeKind: string;
  runtimeMeta: string | null; // JSON-stringified by hub schema
  activatedAt: string | null;
  createdAt: string;
  lastSeenAt: string | null;
}

function parseRuntimeMeta(
  raw: string | null,
): OrgAgent["runtimeMeta"] {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return {
      version: typeof obj.version === "string" ? obj.version : undefined,
      protocolVersion:
        typeof obj.protocolVersion === "string"
          ? obj.protocolVersion
          : undefined,
    };
  } catch {
    return null;
  }
}

function mapAgent(row: HubAgentRow): OrgAgent {
  // V1 has no "archived" agent state — hub deletes agents via DELETE /:id.
  // activatedAt null = paired but not yet registered (rare transient).
  // Anything else = active until the row vanishes.
  const status: OrgAgent["status"] = row.activatedAt ? "active" : "inactive";
  return {
    id: row.id,
    ownerEmployeeId: row.ownerEmployeeId ?? "",
    runtimeKind: row.runtimeKind,
    runtimeMeta: parseRuntimeMeta(row.runtimeMeta),
    status,
    lastSeenAt: row.lastSeenAt,
  };
}

/**
 * Fan out to hub endpoints, fan in to the org-graph payload shape.
 * Sprint B B.4: agents now a real list via the new GET /api/agents endpoint.
 */
export async function fetchOrgGraph(): Promise<OrgGraphPayload> {
  const [employeeRows, departments, projects, agentRows] = await Promise.all([
    api<HubEmployeeRow[]>("/api/employees?limit=500"),
    api<OrgDepartment[]>("/api/departments"),
    api<OrgProject[]>("/api/projects?limit=200"),
    api<HubAgentRow[]>("/api/agents?limit=500"),
  ]);

  const employees = employeeRows.map(mapEmployee);
  const agents = agentRows.map(mapAgent);

  // N+1 fan-out for memberships. For V1 (<10 depts / projects) this is fine;
  // sprint B may collapse to a single aggregate if needed.
  const [deptMemberLists, projectMemberLists] = await Promise.all([
    Promise.all(
      departments.map((d) =>
        api<MemberRow[]>(`/api/departments/${d.id}/members`).catch(
          () => [] as MemberRow[],
        ),
      ),
    ),
    Promise.all(
      projects.map((p) =>
        api<MemberRow[]>(`/api/projects/${p.id}/members`).catch(
          () => [] as MemberRow[],
        ),
      ),
    ),
  ]);

  const departmentMembers: OrgDepartmentMember[] = [];
  for (let i = 0; i < departments.length; i++) {
    const departmentId = departments[i]!.id;
    for (const m of deptMemberLists[i] ?? []) {
      departmentMembers.push({
        employeeId: m.employee.id,
        departmentId,
        role: m.memberRole,
      });
    }
  }
  const projectMembers: OrgProjectMember[] = [];
  for (let i = 0; i < projects.length; i++) {
    const projectId = projects[i]!.id;
    for (const m of projectMemberLists[i] ?? []) {
      projectMembers.push({ employeeId: m.employee.id, projectId });
    }
  }

  return {
    employees,
    departments,
    departmentMembers,
    projects,
    projectMembers,
    agents,
  };
}
