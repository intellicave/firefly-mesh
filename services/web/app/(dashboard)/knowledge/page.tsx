"use client";

// /knowledge — 3-tier KB browser + upload + search.
// Tabs: Company / Department / Personal. Drawer shows preview chunks.
//
// Sprint A (AE1 / W9 changes):
//   - SSE indexing live progress: hub has no /api/stream/* endpoint, so the
//     EventSource is replaced with a single console.warn + a static
//     "Indexing…" badge inside StatusBadge. No reconnection / no red-console.
//   - Multipart upload: hub only accepts inline md/txt POST /api/knowledge.
//     The upload dialog (components/knowledge/upload-dialog.tsx) is rewired
//     to drop the file picker and accept inline text; a banner at the top
//     of this page warns users that multipart upload lands in sprint B.
//   - Search: hub serves GET /api/knowledge/search?q=&scope= (was v0 POST).

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Upload } from "lucide-react";

import { api, ApiCallError } from "@/lib/api-client";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  KnowledgeUploadDialog,
} from "@/components/knowledge/upload-dialog";
import {
  KnowledgeDocumentDrawer,
} from "@/components/knowledge/document-drawer";

interface KnowledgeDocument {
  id: string;
  scope: "company" | "department" | "personal";
  title: string;
  description: string | null;
  fileType: string;
  fileSize: string | null;
  indexStatus: "pending" | "indexing" | "ready" | "failed";
  chunkCount: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  documents: KnowledgeDocument[];
  nextCursor: string | null;
}

interface SearchHit {
  id: string;
  documentId: string;
  text: string;
  scope: string;
  score: number;
  source?: { title?: string };
}

interface SearchResponse {
  chunks: SearchHit[];
}

type Scope = "company" | "department" | "personal";

export default function KnowledgePage() {
  const [scope, setScope] = useState<Scope>("company");
  const [openUpload, setOpenUpload] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ["knowledge-list", scope],
    queryFn: () =>
      api<ListResponse>(`/api/knowledge?scope=${scope}&limit=100`),
    refetchInterval: 30_000,
  });

  const searchMut = useMutation({
    mutationFn: (q: string) => {
      // Hub search is GET ?q=&scope= (v0 was POST). topK isn't a hub param.
      const params = new URLSearchParams({ q, scope: "all" });
      return api<SearchResponse>(`/api/knowledge/search?${params.toString()}`);
    },
  });

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b bg-card px-6">
        <h1 className="font-serif text-lg leading-tight tracking-tight">
          Knowledge
        </h1>
        <button
          type="button"
          onClick={() => setOpenUpload(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Upload size={12} strokeWidth={1.75} />
          Upload
        </button>
      </header>

      <div className="border-b px-6 py-3">
        <Alert variant="warning">
          <AlertTitle>Sprint A: text-only uploads, no live indexing</AlertTitle>
          <AlertDescription>
            Hub currently accepts inline markdown / text only — file uploads
            (PDF, DOCX, multipart) land in sprint B / V1.1. Live indexing
            progress (SSE) is also disabled in this sprint; refresh to see
            updated chunk counts.
          </AlertDescription>
        </Alert>
      </div>

      {/* Search bar — RAG across all visible scopes */}
      <div className="border-b bg-card/40 px-6 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (searchQuery.trim()) searchMut.mutate(searchQuery.trim());
          }}
          className="flex items-center gap-2"
        >
          <Search size={14} strokeWidth={1.75} className="text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search company / department / personal docs…"
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          <button
            type="submit"
            disabled={!searchQuery.trim() || searchMut.isPending}
            className="rounded-md bg-secondary px-3 py-1 text-xs hover:bg-secondary/80 disabled:opacity-50"
          >
            {searchMut.isPending ? "…" : "Search"}
          </button>
        </form>
        {searchMut.data ? (
          <SearchResults
            hits={searchMut.data.chunks}
            onPick={(docId) => setSelectedDocId(docId)}
          />
        ) : null}
      </div>

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
            <DocumentList
              data={list.data}
              isLoading={list.isLoading}
              error={list.error}
              onPick={setSelectedDocId}
              onUploadClick={() => setOpenUpload(true)}
            />
          </TabsContent>
        ))}
      </Tabs>

      <KnowledgeUploadDialog
        open={openUpload}
        defaultScope={scope}
        onOpenChange={setOpenUpload}
        onUploaded={() => {
          setOpenUpload(false);
          void queryClient.invalidateQueries({ queryKey: ["knowledge-list"] });
        }}
      />

      <KnowledgeDocumentDrawer
        documentId={selectedDocId}
        onClose={() => setSelectedDocId(null)}
      />
    </div>
  );
}

function DocumentList({
  data,
  isLoading,
  error,
  onPick,
  onUploadClick,
}: {
  data?: ListResponse;
  isLoading: boolean;
  error: unknown;
  onPick: (id: string) => void;
  onUploadClick: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 size={16} strokeWidth={1.75} className="mr-2 animate-spin" />
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-destructive">
        {error instanceof ApiCallError ? error.message : "Failed to load"}
      </div>
    );
  }
  if (!data || data.documents.length === 0) {
    return (
      <EmptyState
        Icon={Upload}
        title="No documents yet"
        description="Upload markdown or plain text. PDF/DOCX support lands in sprint B."
        cta={{
          label: "Upload first document",
          icon: Upload,
          onClick: onUploadClick,
        }}
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {data.documents.map((d) => (
        <article
          key={d.id}
          className="cursor-pointer rounded-lg border bg-card p-4 hover:border-primary/40"
          onClick={() => onPick(d.id)}
        >
          <div className="flex items-start gap-2">
            <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase">
              {d.fileType}
            </span>
            <h3 className="line-clamp-2 flex-1 text-sm font-medium">
              {d.title}
            </h3>
          </div>
          {d.description ? (
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
              {d.description}
            </p>
          ) : null}
          <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="font-mono">{d.chunkCount ?? 0} chunks</span>
            <StatusBadge status={d.indexStatus} />
          </div>
        </article>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: KnowledgeDocument["indexStatus"] }) {
  const colors = {
    pending: "bg-muted text-muted-foreground",
    indexing: "bg-amber-500/15 text-amber-700",
    ready: "bg-emerald-500/15 text-emerald-700",
    failed: "bg-destructive/15 text-destructive",
  } as const;
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono ${colors[status]}`}>
      {status}
    </span>
  );
}

function SearchResults({
  hits,
  onPick,
}: {
  hits: SearchHit[];
  onPick: (id: string) => void;
}) {
  if (hits.length === 0) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">No results.</p>
    );
  }
  return (
    <ol className="mt-3 space-y-2">
      {hits.map((h) => (
        <li
          key={h.id}
          className="cursor-pointer rounded-md border bg-card p-2 text-xs hover:border-primary/40"
          onClick={() => onPick(h.documentId)}
        >
          <div className="flex items-center gap-2">
            <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[9px] uppercase">
              {h.scope}
            </span>
            <span className="font-medium">{h.source?.title ?? "(untitled)"}</span>
            <span className="ml-auto font-mono text-muted-foreground">
              {h.score.toFixed(3)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-muted-foreground">{h.text}</p>
        </li>
      ))}
    </ol>
  );
}
