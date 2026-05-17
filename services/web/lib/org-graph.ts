// Sprint A client-side aggregation for the legacy /api/org/graph response.
// Hub has no equivalent aggregate endpoint; we compose it from several paths
// in parallel and rebuild the v0 shape so /organization/page.tsx + the graph
// view component keep their existing data contract.
//
// Known sprint A gaps (sprint B fills these):
//   - Agents: hub has no list-all-agents-in-tenant endpoint, only
//     /api/me/agents (current user only). We fan out N+1 GET
//     /api/employees/:id/agents calls — but that endpoint also doesn't
//     exist on hub. Result: sprint A returns agents=[]; the graph shows
//     employees + departments without per-employee agent badges. The page
//     surfaces a banner so users know agent indicators are coming.
//   - Department / project memberships: hub serves these via per-resource
//     endpoints (GET /api/departments/:id/members). We fan out one fetch
//     per department + per project; acceptable for V1 orgs (<10 each).
//
// Tradeoff: more round trips than v0's single aggregate. V1 orgs are small;
// sprint B may add a hub /api/org/graph aggregator if real load shows pain.

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

/**
 * Fan out to hub endpoints, fan in to v0-shaped payload. See file header for
 * the known sprint A gaps that surface as empty arrays here.
 */
export async function fetchOrgGraph(): Promise<OrgGraphPayload> {
  const [employeeRows, departments, projects] = await Promise.all([
    api<HubEmployeeRow[]>("/api/employees?limit=500"),
    api<OrgDepartment[]>("/api/departments"),
    api<OrgProject[]>("/api/projects?limit=200"),
  ]);

  const employees = employeeRows.map(mapEmployee);

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
    // sprint A gap: no hub endpoint for tenant-wide agent list. See file header.
    agents: [],
  };
}
