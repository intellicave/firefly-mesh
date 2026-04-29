"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Play, Trash2, X } from "lucide-react";

import { api, ApiCallError } from "@/lib/api-client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface SkillDetail {
  skill: {
    id: string;
    manifestId: string;
    version: string;
    scope: "company" | "department" | "personal";
    status: string;
    manifest: {
      name: string;
      description: string;
      tags?: string[];
      tools?: Array<{ name: string; description: string }>;
    };
    createdAt: string;
  };
  conflicts: Array<{
    id: string;
    scope: string;
    version: string;
  }>;
}

export function SkillDrawer({
  skillId,
  onClose,
  onChanged,
}: {
  skillId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const open = skillId !== null;

  const detail = useQuery({
    queryKey: ["skill", skillId],
    queryFn: () => api<SkillDetail>(`/api/skill/${skillId}`),
    enabled: open,
  });

  const dryRun = useMutation({
    mutationFn: () =>
      api<{ output: string; latencyMs: number }>(
        `/api/skill/${skillId}/dry-run`,
        { method: "POST", body: { sampleInput: {} } },
      ),
  });

  const archive = useMutation({
    mutationFn: () =>
      api(`/api/skill/${skillId}`, { method: "DELETE" }),
    onSuccess: () => {
      onChanged();
      onClose();
    },
  });

  return (
    <Sheet open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <SheetContent side="right" className="w-[34rem] sm:max-w-[34rem]">
        <SheetHeader className="border-b pb-3">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="truncate font-serif text-base">
              {detail.data?.skill.manifest.name ?? "Skill"}
            </SheetTitle>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex size-8 items-center justify-center rounded-md hover:bg-secondary"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {detail.isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2
                size={16}
                strokeWidth={1.75}
                className="mr-2 animate-spin"
              />
              Loading…
            </div>
          ) : detail.error ? (
            <div className="rounded-md border bg-destructive/10 p-3 text-sm text-destructive">
              {detail.error instanceof ApiCallError
                ? detail.error.message
                : "Failed to load skill"}
            </div>
          ) : detail.data ? (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded bg-secondary px-2 py-0.5 font-mono">
                  {detail.data.skill.manifestId}@{detail.data.skill.version}
                </span>
                <span className="rounded bg-secondary px-2 py-0.5 font-mono uppercase">
                  {detail.data.skill.scope}
                </span>
                <span
                  className={`rounded px-2 py-0.5 font-mono ${
                    detail.data.skill.status === "active"
                      ? "bg-emerald-500/15 text-emerald-700"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {detail.data.skill.status}
                </span>
              </div>

              <p className="text-sm">
                {detail.data.skill.manifest.description}
              </p>

              {detail.data.skill.manifest.tools &&
              detail.data.skill.manifest.tools.length > 0 ? (
                <div>
                  <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Tools
                  </h3>
                  <ol className="space-y-1.5">
                    {detail.data.skill.manifest.tools.map((t) => (
                      <li
                        key={t.name}
                        className="rounded-md border bg-card p-2 text-xs"
                      >
                        <div className="font-mono">{t.name}</div>
                        <div className="text-muted-foreground">
                          {t.description}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              {detail.data.conflicts.length > 0 ? (
                <div>
                  <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Conflicts ({detail.data.conflicts.length})
                  </h3>
                  <ul className="space-y-1">
                    {detail.data.conflicts.map((c) => (
                      <li
                        key={c.id}
                        className="rounded border bg-amber-500/5 px-2 py-1 font-mono text-xs"
                      >
                        {c.scope} · {c.version}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Same manifest_id at multiple scopes — Personal &gt; Department &gt; Company priority applies.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 border-t pt-3">
                <button
                  type="button"
                  onClick={() => dryRun.mutate()}
                  disabled={dryRun.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
                >
                  <Play size={12} strokeWidth={1.75} />
                  {dryRun.isPending ? "Running…" : "Dry-run"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm("Archive this skill? It will be hidden but kept for audit.")
                    )
                      archive.mutate();
                  }}
                  disabled={archive.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive hover:bg-destructive/20 disabled:opacity-50"
                >
                  <Trash2 size={12} strokeWidth={1.75} />
                  Archive
                </button>
              </div>

              {dryRun.data ? (
                <div>
                  <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Dry-run output ({dryRun.data.latencyMs} ms)
                  </h3>
                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-2 font-mono text-xs">
                    {dryRun.data.output}
                  </pre>
                </div>
              ) : null}
              {dryRun.error ? (
                <div className="rounded-md border bg-destructive/10 p-2 text-xs text-destructive">
                  {dryRun.error instanceof ApiCallError
                    ? dryRun.error.message
                    : "Dry-run failed"}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
