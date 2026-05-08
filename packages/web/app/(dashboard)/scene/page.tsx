"use client";

// /scene — pixel-art isometric org visualisation.
// PhaserGame is dynamically imported (ssr:false) so Phaser never runs server-side.
// AgentDetailDrawer is reused from /organization — no duplication (M1-5).

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { useSceneDataBridge } from "@/lib/scene/data-bindings";
import { sceneBus } from "@/lib/scene/event-bus";
import { SceneToolbar } from "@/components/scene/SceneToolbar";
import { AgentDetailDrawer } from "@/components/organization/agent-detail-drawer";
import type { OrgEmployee, OrgAgent } from "@/lib/scene/event-bus";

// Zero bundle impact on other routes — loaded only when /scene is mounted
const PhaserGame = dynamic(
  () => import("@/components/scene/PhaserGame").then((m) => ({ default: m.PhaserGame })),
  { ssr: false, loading: () => <SceneLoadingPlaceholder /> },
);

interface DrawerTarget {
  employee: OrgEmployee;
  agent: OrgAgent | null;
}

export default function ScenePage() {
  const { orgData, isLoading, refetch } = useSceneDataBridge();
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);

  // Keep a stable ref to orgData so the event handler sees fresh data without
  // re-subscribing on every render.
  const orgDataRef = useRef(orgData);
  useEffect(() => { orgDataRef.current = orgData; }, [orgData]);

  // Wire employee-click events from Phaser → open drawer
  useEffect(() => {
    const off = sceneBus.on("employeeClick", ({ employeeId }) => {
      const data = orgDataRef.current;
      const emp = data?.employees.find((e) => e.id === employeeId);
      if (!emp) return;
      const agent = data?.agents.find((a) => a.ownerEmployeeId === employeeId) ?? null;
      setDrawer({ employee: emp, agent });
    });
    return off;
  }, []);

  // Adapt OrgEmployee → AgentDetailDrawer's expected shape
  const drawerEmployee = drawer
    ? {
        id: drawer.employee.id,
        name: drawer.employee.name,
        email: drawer.employee.email,
        title: drawer.employee.title,
        avatarUrl: drawer.employee.avatarUrl,
        role: drawer.employee.role as "owner" | "admin" | "manager" | "employee" | "auditor",
        status: drawer.employee.status as "active" | "archived",
      }
    : null;

  const drawerAgent = drawer?.agent
    ? {
        id: drawer.agent.id,
        ownerEmployeeId: drawer.agent.ownerEmployeeId,
        runtimeKind: "",
        runtimeMeta: null,
        status: drawer.agent.status as "inactive" | "active" | "archived",
        lastSeenAt: null,
      }
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SceneToolbar
        orgData={orgData}
        isLoading={isLoading}
        onRefresh={() => refetch()}
      />

      {/* Phaser canvas fills remaining space */}
      <div className="relative flex-1 overflow-hidden bg-[#0d0f14]">
        <PhaserGame />
      </div>

      <AgentDetailDrawer
        employee={drawerEmployee}
        agent={drawerAgent}
        open={drawer !== null}
        onOpenChange={(open) => { if (!open) setDrawer(null); }}
        canEditBoundary={false}
      />
    </div>
  );
}

function SceneLoadingPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0d0f14]">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="size-8 animate-pulse rounded-sm bg-primary/20" />
        <span className="text-xs">Loading scene…</span>
      </div>
    </div>
  );
}
