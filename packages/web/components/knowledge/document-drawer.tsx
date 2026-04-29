"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Trash2, X } from "lucide-react";

import { api, ApiCallError } from "@/lib/api-client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface PreviewChunk {
  id: string;
  chunkIndex: string;
  content: string;
  headingPath: string[] | null;
}

interface DocResponse {
  document: {
    id: string;
    title: string;
    description: string | null;
    scope: "company" | "department" | "personal";
    fileType: string;
    chunkCount: string | null;
    indexStatus: string;
    embedModel: string | null;
    lastIndexedAt: string | null;
    createdAt: string;
  };
  previewChunks: PreviewChunk[];
}

export function KnowledgeDocumentDrawer({
  documentId,
  onClose,
}: {
  documentId: string | null;
  onClose: () => void;
}) {
  const open = documentId !== null;
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ["knowledge-doc", documentId],
    queryFn: () => api<DocResponse>(`/api/knowledge/${documentId}`),
    enabled: open,
  });

  const reindex = useMutation({
    mutationFn: () =>
      api(`/api/knowledge/${documentId}/reindex`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["knowledge-doc"] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge-list"] });
    },
  });

  const del = useMutation({
    mutationFn: () =>
      api(`/api/knowledge/${documentId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["knowledge-list"] });
      onClose();
    },
  });

  return (
    <Sheet open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <SheetContent side="right" className="w-[34rem] sm:max-w-[34rem]">
        <SheetHeader className="border-b pb-3">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="truncate font-serif text-base">
              {detail.data?.document.title ?? "Document"}
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
                : "Failed to load document"}
            </div>
          ) : detail.data ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Field
                  label="Scope"
                  value={detail.data.document.scope}
                  mono
                />
                <Field
                  label="Type"
                  value={detail.data.document.fileType}
                  mono
                />
                <Field
                  label="Chunks"
                  value={detail.data.document.chunkCount ?? "0"}
                  mono
                />
                <Field
                  label="Status"
                  value={detail.data.document.indexStatus}
                  mono
                />
                <Field
                  label="Embed model"
                  value={detail.data.document.embedModel ?? "—"}
                  mono
                />
                <Field
                  label="Last indexed"
                  value={
                    detail.data.document.lastIndexedAt
                      ? new Date(
                          detail.data.document.lastIndexedAt,
                        ).toLocaleString()
                      : "—"
                  }
                />
              </div>

              {detail.data.document.description ? (
                <p className="rounded-md border bg-muted/20 p-3 text-sm">
                  {detail.data.document.description}
                </p>
              ) : null}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => reindex.mutate()}
                  disabled={reindex.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
                >
                  <RefreshCw size={12} strokeWidth={1.75} />
                  {reindex.isPending ? "Reindexing…" : "Reindex"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Delete this document and all its chunks?"))
                      del.mutate();
                  }}
                  disabled={del.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive hover:bg-destructive/20 disabled:opacity-50"
                >
                  <Trash2 size={12} strokeWidth={1.75} />
                  Delete
                </button>
              </div>

              {(reindex.error || del.error) ? (
                <div className="rounded-md border bg-destructive/10 p-2 text-xs text-destructive">
                  {((reindex.error ?? del.error) as ApiCallError | Error)
                    .message}
                </div>
              ) : null}

              <div>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  First chunks
                </h3>
                <ol className="space-y-1.5">
                  {detail.data.previewChunks.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-md border bg-card p-2 text-xs"
                    >
                      {c.headingPath && c.headingPath.length > 0 ? (
                        <div className="mb-1 font-mono text-[10px] text-muted-foreground">
                          {c.headingPath.join(" / ")}
                        </div>
                      ) : null}
                      <pre className="whitespace-pre-wrap font-sans">
                        {c.content.slice(0, 500)}
                        {c.content.length > 500 ? "…" : ""}
                      </pre>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={mono ? "font-mono text-xs" : "text-xs"}>{value}</div>
    </div>
  );
}
