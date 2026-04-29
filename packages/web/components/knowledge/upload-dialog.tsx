"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";

import { ApiCallError } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Department {
  id: string;
  name: string;
}

export function KnowledgeUploadDialog({
  open,
  defaultScope,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  defaultScope: "company" | "department" | "personal";
  onOpenChange: (v: boolean) => void;
  onUploaded: (docId: string) => void;
}) {
  const [scope, setScope] =
    useState<"company" | "department" | "personal">(defaultScope);
  const [deptId, setDeptId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setScope(defaultScope);
    setDeptId("");
    setTitle("");
    setDescription("");
    setFile(null);
    setErr(null);
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("scope", scope);
      fd.append("title", title || file.name);
      if (description) fd.append("description", description);
      if (scope === "department" && deptId) fd.append("deptId", deptId);

      const res = await fetch("/api/knowledge/upload", {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { documentId: string };
        error?: { code?: string; message?: string };
      };
      if (!res.ok) {
        throw new ApiCallError(res.status, {
          code: json.error?.code ?? "HTTP_" + res.status,
          message: json.error?.message ?? `HTTP ${res.status}`,
        });
      }
      reset();
      onUploaded(json.data!.documentId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload to knowledge base</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Scope</label>
            <select
              value={scope}
              onChange={(e) =>
                setScope(
                  e.target.value as "company" | "department" | "personal",
                )
              }
              className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="company">Company</option>
              <option value="department">Department</option>
              <option value="personal">Personal</option>
            </select>
          </div>

          {scope === "department" ? (
            <DepartmentPicker value={deptId} onChange={setDeptId} />
          ) : null}

          <div>
            <label className="text-sm font-medium">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="(filename if blank)"
              className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm"
              maxLength={200}
            />
          </div>

          <div>
            <label className="text-sm font-medium">
              Description{" "}
              <span className="text-xs text-muted-foreground">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1.5 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm"
              rows={2}
              maxLength={1000}
            />
          </div>

          <div>
            <label className="text-sm font-medium">File</label>
            <input
              type="file"
              accept=".pdf,.docx,.md,.txt,.html"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1.5 block w-full text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              pdf / docx / md / txt / html · max 50 MB
            </p>
          </div>

          {err ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {err}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md border bg-card px-4 py-2 text-sm hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!file || busy || (scope === "department" && !deptId)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 size={12} strokeWidth={1.75} className="animate-spin" />
                  Uploading…
                </>
              ) : (
                "Upload"
              )}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-md hover:bg-secondary"
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </DialogContent>
    </Dialog>
  );
}

function DepartmentPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  // Inline lazy fetch — no global state.
  const [opts, setOpts] = useState<Department[] | null>(null);
  if (opts === null) {
    void fetch("/api/department", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { data?: Department[] }) => {
        setOpts(Array.isArray(j.data) ? j.data : []);
      })
      .catch(() => setOpts([]));
  }
  return (
    <div>
      <label className="text-sm font-medium">Department</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm"
      >
        <option value="">Select…</option>
        {(opts ?? []).map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </div>
  );
}
