"use client";

// Sprint A (AE1 / W9): hub only accepts inline md/txt POST /api/knowledge.
// Multipart file upload (PDF/DOCX/HTML) lands in sprint B / V1.1, so the
// file <input type="file"> is replaced with a <textarea> + a fileType
// chooser (md | txt). Cancel button + banner explain the change.

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

import { api, ApiCallError } from "@/lib/api-client";
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

interface CreateResponse {
  id: string;
}

// Must stay in sync with hub `MAX_INLINE_BYTES` in services/hub/src/routes/knowledge.ts.
// v3 round-3 reviewer M1 fix: was 200_000 (wrong — hub caps at 100 KB), so
// content between 100 KB and 200 KB passed client validation but the hub
// returned 422 — the user got a confusing post-submit failure. Now matches
// hub's 100 * 1024 cap exactly.
const MAX_INLINE_BYTES = 100 * 1024;

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
  const [fileType, setFileType] = useState<"md" | "txt">("md");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setScope(defaultScope);
    setDeptId("");
    setTitle("");
    setDescription("");
    setFileType("md");
    setContent("");
    setErr(null);
  };

  const submit = async () => {
    if (!content.trim() || !title.trim()) return;
    if (new TextEncoder().encode(content).byteLength > MAX_INLINE_BYTES) {
      setErr(
        `Content too large (max ${MAX_INLINE_BYTES.toLocaleString()} bytes / ` +
          `~${Math.floor(MAX_INLINE_BYTES / 1024)} KB). ` +
          "Multipart upload for larger files lands in V1.1 Vectorize sprint.",
      );
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        scope,
        title: title.trim(),
        fileType,
        content,
      };
      if (description.trim()) body.description = description.trim();
      if (scope === "department" && deptId) body.departmentId = deptId;

      const data = await api<CreateResponse>("/api/knowledge", {
        method: "POST",
        body,
      });
      reset();
      onUploaded(data.id);
    } catch (e) {
      setErr(
        e instanceof ApiCallError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Upload failed",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add knowledge document</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
            Sprint A: inline markdown / text only. File upload (PDF / DOCX /
            multipart) lands in sprint B.
          </p>

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
              placeholder="Required"
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

          <div className="grid grid-cols-[6rem_1fr] gap-3">
            <div>
              <label className="text-sm font-medium">File type</label>
              <select
                value={fileType}
                onChange={(e) => setFileType(e.target.value as "md" | "txt")}
                className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="md">md</option>
                <option value="txt">txt</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Content</label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Max ~100 KB inline.
              </p>
            </div>
          </div>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste markdown or plain text…"
            className="block h-48 w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-xs"
          />

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
              disabled={
                !content.trim() ||
                !title.trim() ||
                busy ||
                (scope === "department" && !deptId)
              }
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 size={12} strokeWidth={1.75} className="animate-spin" />
                  Saving…
                </>
              ) : (
                "Add"
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
  // Fetch in useEffect (not in render body — that pattern double-fires in
  // React Strict Mode and has no cancellation). Path renamed v0
  // /api/department → hub /api/departments; api() unwraps { data: [...] }.
  const [opts, setOpts] = useState<Department[] | null>(null);
  useEffect(() => {
    let active = true;
    api<Department[]>("/api/departments")
      .then((data) => {
        if (active) setOpts(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (active) setOpts([]);
      });
    return () => {
      active = false;
    };
  }, []);
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
