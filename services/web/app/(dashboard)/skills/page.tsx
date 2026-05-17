"use client";

// /skills — 3-tier skill registry browser + create dialog + drawer.
// Conflict preview surfaces when same manifest_id exists at multiple scopes.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Sparkles } from "lucide-react";

import { api, ApiCallError } from "@/lib/api-client";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SkillDrawer } from "@/components/skills/skill-drawer";
import { SkillCreateDialog } from "@/components/skills/create-dialog";

interface SkillRow {
  id: string;
  manifestId: string;
  version: string;
  scope: "company" | "department" | "personal";
  status: "active" | "deprecated" | "archived";
  manifest: {
    name: string;
    description: string;
    version: string;
    tags?: string[];
  };
  createdAt: string;
}

interface ListResponse {
  skills: SkillRow[];
  nextCursor: string | null;
}

// Sprint A: "Loaded for me" tab disabled — hub has no /api/skills/loaded
// endpoint (M9 P26 defers skill execution engine to V2 sprint).
type Scope = "company" | "department" | "personal";

export default function SkillsPage() {
  const [scope, setScope] = useState<Scope>("company");
  const [openCreate, setOpenCreate] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ["skills-list", scope],
    queryFn: () =>
      api<ListResponse>(`/api/skills?scope=${scope}&limit=100`),
    refetchInterval: 60_000,
  });

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b bg-card px-6">
        <h1 className="font-serif text-lg leading-tight tracking-tight">
          Skills
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpenCreate(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus size={12} strokeWidth={1.75} />
            New skill
          </button>
        </div>
      </header>

      <Tabs
        value={scope}
        onValueChange={(v) => setScope(v as Scope)}
        className="flex flex-1 flex-col"
      >
        <TabsList className="mx-6 mt-4 grid w-fit grid-cols-3">
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="department">Department</TabsTrigger>
          <TabsTrigger value="personal">Personal</TabsTrigger>
        </TabsList>

        {(["company", "department", "personal"] as const).map((t) => (
          <TabsContent
            key={t}
            value={t}
            className="flex-1 overflow-y-auto px-6 pb-6 pt-4"
          >
            {list.isLoading ? (
              <Loading />
            ) : list.error ? (
              <ErrorBox error={list.error} />
            ) : !list.data || list.data.skills.length === 0 ? (
              <Empty onCreateClick={() => setOpenCreate(true)} />
            ) : (
              <SkillGrid
                rows={list.data.skills}
                onPick={setSelected}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>

      <SkillCreateDialog
        open={openCreate}
        defaultScope={scope}
        onOpenChange={setOpenCreate}
        onCreated={() => {
          setOpenCreate(false);
          void queryClient.invalidateQueries({ queryKey: ["skills-list"] });
          void queryClient.invalidateQueries({ queryKey: ["skills-loaded"] });
        }}
      />

      <SkillDrawer
        skillId={selected}
        onClose={() => setSelected(null)}
        onChanged={() => {
          void queryClient.invalidateQueries({ queryKey: ["skills-list"] });
          void queryClient.invalidateQueries({ queryKey: ["skills-loaded"] });
        }}
      />
    </div>
  );
}

function SkillGrid({
  rows,
  onPick,
}: {
  rows: SkillRow[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {rows.map((s) => (
        <article
          key={s.id}
          className="cursor-pointer rounded-lg border bg-card p-4 hover:border-primary/40"
          onClick={() => onPick(s.id)}
        >
          <div className="flex items-start gap-2">
            <Sparkles
              size={14}
              strokeWidth={1.75}
              className="mt-0.5 text-primary"
            />
            <div className="flex-1 min-w-0">
              <h3 className="truncate text-sm font-medium">
                {s.manifest.name}
              </h3>
              <div className="font-mono text-[10px] text-muted-foreground">
                {s.manifestId}@{s.version}
              </div>
            </div>
            <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[9px] uppercase">
              {s.scope}
            </span>
          </div>
          <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
            {s.manifest.description}
          </p>
          {s.manifest.tags && s.manifest.tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {s.manifest.tags.slice(0, 4).map((t) => (
                <span
                  key={t}
                  className="rounded bg-muted/60 px-1.5 py-0.5 text-[9px]"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-12 text-muted-foreground">
      <Loader2 size={16} strokeWidth={1.75} className="mr-2 animate-spin" />
      Loading…
    </div>
  );
}

function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="rounded-lg border bg-card p-6 text-sm text-destructive">
      {error instanceof ApiCallError ? error.message : "Failed to load"}
    </div>
  );
}

function Empty({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <EmptyState
      Icon={Sparkles}
      title="No skills yet"
      description="Skills are agentskills.io-compatible packages your agents can install. Define them at company / department / personal scope."
      cta={{
        label: "Create your first skill",
        icon: Plus,
        onClick: onCreateClick,
      }}
    />
  );
}
