"use client";

// Force-directed org graph (xyflow + dagre layout).
// Per ui.md §4.2 — node click → AgentDetailDrawer; minimap + controls; mesh-in animation.
//
// Hierarchy:
//   - Root: owner (or first admin if no owner)
//   - Department heads (department_members.role === 'head') connect to root
//   - Department members (role !== 'head') connect to their dept head
//   - Unassigned employees connect to root

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export interface OrgEmployee {
  id: string;
  name: string;
  email: string;
  title: string | null;
  avatarUrl: string | null;
  role: "owner" | "admin" | "manager" | "employee" | "auditor";
  status: "active" | "archived";
}

export interface OrgAgent {
  id: string;
  ownerEmployeeId: string;
  runtimeKind: string;
  runtimeMeta: { version?: string; protocolVersion?: string } | null;
  status: "inactive" | "active" | "archived";
  lastSeenAt: string | null;
}

export interface OrgDepartment {
  id: string;
  name: string;
}

export interface OrgDepartmentMember {
  departmentId: string;
  employeeId: string;
  role: string | null;
}

interface NodeData extends Record<string, unknown> {
  employee: OrgEmployee;
  agent: OrgAgent | undefined;
  agentCount: number;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 92;

export function OrgGraph({
  employees,
  agents,
  departments,
  departmentMembers,
  filterDepartmentId,
  onSelect,
}: {
  employees: OrgEmployee[];
  agents: OrgAgent[];
  departments: OrgDepartment[];
  departmentMembers: OrgDepartmentMember[];
  filterDepartmentId: string | null;
  onSelect: (employeeId: string) => void;
}) {
  const { nodes, edges } = useMemo(
    () =>
      buildGraph({
        employees,
        agents,
        departments,
        departmentMembers,
        filterDepartmentId,
      }),
    [employees, agents, departments, departmentMembers, filterDepartmentId],
  );

  return (
    <div className="h-[calc(100vh-9rem)] w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_e, n) => onSelect(n.id)}
        defaultEdgeOptions={{
          style: { stroke: "var(--color-muted-foreground)", strokeWidth: 1, opacity: 0.5 },
        }}
      >
        <Background gap={20} size={1} color="var(--color-border)" />
        <Controls showInteractive={false} className="!bg-card !border" />
        <MiniMap
          pannable
          zoomable
          className="!bg-card !border"
          nodeColor={(n) => {
            const data = n.data as NodeData;
            return data.agent?.status === "active"
              ? "var(--color-primary)"
              : "var(--color-muted-foreground)";
          }}
          nodeStrokeWidth={2}
          maskColor="rgba(0,0,0,0.05)"
        />
      </ReactFlow>
    </div>
  );
}

function buildGraph(input: {
  employees: OrgEmployee[];
  agents: OrgAgent[];
  departments: OrgDepartment[];
  departmentMembers: OrgDepartmentMember[];
  filterDepartmentId: string | null;
}): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const { employees, agents, departments, departmentMembers, filterDepartmentId } =
    input;

  const empById = new Map(employees.map((e) => [e.id, e]));
  const agentByOwner = new Map<string, OrgAgent>();
  const agentCountByOwner = new Map<string, number>();
  for (const a of agents) {
    if (!agentByOwner.has(a.ownerEmployeeId)) {
      agentByOwner.set(a.ownerEmployeeId, a);
    }
    agentCountByOwner.set(
      a.ownerEmployeeId,
      (agentCountByOwner.get(a.ownerEmployeeId) ?? 0) + 1,
    );
  }

  // department head map: deptId → head employeeId(s)
  const headsByDept = new Map<string, string[]>();
  // member map: employeeId → deptIds
  const deptsByEmp = new Map<string, string[]>();
  for (const m of departmentMembers) {
    const list = deptsByEmp.get(m.employeeId) ?? [];
    list.push(m.departmentId);
    deptsByEmp.set(m.employeeId, list);
    if (m.role === "head") {
      const heads = headsByDept.get(m.departmentId) ?? [];
      heads.push(m.employeeId);
      headsByDept.set(m.departmentId, heads);
    }
  }

  // root selection — prefer owner, fall back to first admin
  const owner = employees.find((e) => e.role === "owner");
  const firstAdmin = employees.find((e) => e.role === "admin");
  const rootId = (owner ?? firstAdmin ?? employees[0])?.id ?? null;

  // Filter employees if filterDepartmentId is set:
  //   keep only members of that dept + the root (so the connection stays drawn)
  const visibleEmpIds = new Set<string>();
  if (filterDepartmentId) {
    for (const m of departmentMembers) {
      if (m.departmentId === filterDepartmentId) {
        visibleEmpIds.add(m.employeeId);
      }
    }
    if (rootId) visibleEmpIds.add(rootId);
  } else {
    for (const e of employees) visibleEmpIds.add(e.id);
  }

  const nodes: Node<NodeData>[] = [];
  const edges: Edge[] = [];
  const seenEdges = new Set<string>();

  function addEdge(source: string, target: string) {
    const key = `${source}->${target}`;
    if (seenEdges.has(key)) return;
    if (source === target) return;
    if (!visibleEmpIds.has(source) || !visibleEmpIds.has(target)) return;
    seenEdges.add(key);
    edges.push({ id: key, source, target });
  }

  for (const emp of employees) {
    if (!visibleEmpIds.has(emp.id)) continue;
    nodes.push({
      id: emp.id,
      type: "employee",
      position: { x: 0, y: 0 }, // dagre fills below
      data: {
        employee: emp,
        agent: agentByOwner.get(emp.id),
        agentCount: agentCountByOwner.get(emp.id) ?? 0,
      },
    });
  }

  if (rootId) {
    // department heads → root
    for (const [deptId, heads] of headsByDept.entries()) {
      void deptId;
      for (const headId of heads) {
        addEdge(rootId, headId);
      }
    }
    // department members → their head (or root if no head)
    for (const m of departmentMembers) {
      if (m.role === "head") continue;
      const heads = headsByDept.get(m.departmentId) ?? [];
      const parentId = heads[0] ?? rootId;
      addEdge(parentId, m.employeeId);
    }
    // unassigned employees → root
    for (const emp of employees) {
      if (emp.id === rootId) continue;
      const empDepts = deptsByEmp.get(emp.id) ?? [];
      if (empDepts.length === 0) addEdge(rootId, emp.id);
    }
  }

  // Dagre layout
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "TB",
    nodesep: 50,
    ranksep: 80,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);

  const positioned = nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    };
  });

  void empById;
  return { nodes: positioned, edges };
}

const NODE_TYPES = {
  employee: EmployeeNode,
};

function EmployeeNode({ data, selected }: NodeProps) {
  const { employee, agent, agentCount } = data as NodeData;
  const initials = employee.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const online = agent?.status === "active";

  return (
    <div
      className={cn(
        "animate-mesh-in rounded-md border bg-card px-3 py-2 shadow-sm transition-colors",
        selected ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/60",
      )}
      style={{ width: NODE_WIDTH }}
    >
      <Handle type="target" position={Position.Top} className="!h-1 !w-1 !border-0 !bg-muted-foreground/40" />

      <div className="flex items-center gap-2">
        <Avatar className="size-8 shrink-0">
          {employee.avatarUrl ? (
            <AvatarImage src={employee.avatarUrl} alt={employee.name} />
          ) : null}
          <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{employee.name}</div>
          <div className="truncate text-[10px] text-muted-foreground">
            {employee.title ?? employee.role}
          </div>
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10px]">
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <span
            className={cn(
              "inline-block size-1.5 rounded-full",
              online ? "bg-emerald-500" : "bg-muted-foreground/40",
            )}
          />
          {agent ? (online ? "online" : agent.status) : "no agent"}
        </span>
        {agentCount > 0 ? (
          <span className="rounded bg-secondary px-1 py-0.5 font-mono text-muted-foreground">
            {agentCount} agent{agentCount === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      <Handle type="source" position={Position.Bottom} className="!h-1 !w-1 !border-0 !bg-muted-foreground/40" />
    </div>
  );
}
