"use client";

// Scene toolbar: view toggle (Org / Task / A2A) + live stats + refresh.
// Subscribes to sceneBus events from Phaser; never imports Phaser directly (C3).

import { useEffect, useState } from "react";
import { Network, RefreshCw, Send, StickyNote } from "lucide-react";

import { sceneBus } from "@/lib/scene/event-bus";
import { cn } from "@/lib/utils";
import type { OrgGraphPayload } from "@/lib/scene/event-bus";

type ViewMode = "org" | "task" | "a2a";

interface SceneToolbarProps {
  orgData: OrgGraphPayload | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export function SceneToolbar({ orgData, isLoading, onRefresh }: SceneToolbarProps) {
  const [view, setView] = useState<ViewMode>("org");
  const [sceneReady, setSceneReady] = useState(false);
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    const offReady = () => setSceneReady(true);
    const offView = ({ view: v }: { view: ViewMode }) => setView(v);
    const offFps = ({ value }: { value: number }) => setFps(value);

    sceneBus.on("sceneReady", offReady);
    sceneBus.on("viewChanged", offView);
    sceneBus.on("fps", offFps);
    return () => {
      sceneBus.off("sceneReady", offReady);
      sceneBus.off("viewChanged", offView);
      sceneBus.off("fps", offFps);
    };
  }, []);

  function switchView(v: ViewMode) {
    sceneBus.emit("setView", { view: v });
  }

  const employeeCount = orgData?.employees.length ?? 0;
  const agentCount = orgData?.agents.filter((a) => a.status === "active").length ?? 0;
  const deptCount = orgData?.departments.length ?? 0;

  return (
    <div className="flex h-12 items-center justify-between border-b bg-card/90 px-4 backdrop-blur-sm">
      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{employeeCount} employees</span>
        <span>{deptCount} depts</span>
        <span>{agentCount} active agents</span>
        {fps !== null && (
          <span className={cn("font-mono", fps < 30 && "text-destructive")}>
            {fps} fps
          </span>
        )}
      </div>

      {/* View toggle */}
      <div className="inline-flex h-8 items-center rounded-md border bg-background p-0.5">
        <ViewBtn
          Icon={Network}
          label="Org"
          active={view === "org"}
          disabled={!sceneReady}
          onClick={() => switchView("org")}
        />
        <ViewBtn
          Icon={StickyNote}
          label="Task"
          active={view === "task"}
          disabled={!sceneReady}
          onClick={() => switchView("task")}
        />
        <ViewBtn
          Icon={Send}
          label="A2A"
          active={view === "a2a"}
          disabled={!sceneReady}
          onClick={() => switchView("a2a")}
        />
      </div>

      {/* Refresh */}
      <button
        type="button"
        onClick={onRefresh}
        className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-2 text-xs hover:bg-secondary disabled:opacity-50"
        disabled={isLoading}
      >
        <RefreshCw
          size={12}
          strokeWidth={1.75}
          className={cn(isLoading && "animate-spin")}
        />
        Refresh
      </button>
    </div>
  );
}

function ViewBtn({
  Icon, label, active, disabled, onClick,
}: {
  Icon: typeof Network;
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded px-2 text-xs disabled:opacity-40",
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
