"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";

import { api, ApiCallError } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function SkillCreateDialog({
  open,
  defaultScope,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  defaultScope: "company" | "department" | "personal";
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [manifestId, setManifestId] = useState("");
  const [version, setVersion] = useState("0.1.0");
  const [scope, setScope] =
    useState<"company" | "department" | "personal">(defaultScope);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");

  const create = useMutation({
    mutationFn: async () =>
      api("/api/skills", {
        method: "POST",
        body: {
          manifestId,
          version,
          scope,
          manifest: {
            name,
            description,
            version,
            tags: tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          },
        },
      }),
    onSuccess: () => {
      setManifestId("");
      setName("");
      setDescription("");
      setTags("");
      onCreated();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New skill</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Manifest ID" help="e.g. firefly-mesh/email-draft">
            <input
              type="text"
              value={manifestId}
              onChange={(e) => setManifestId(e.target.value)}
              required
              className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Version" help="SemVer">
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
              />
            </Field>
            <Field label="Scope">
              <select
                value={scope}
                onChange={(e) =>
                  setScope(
                    e.target.value as "company" | "department" | "personal",
                  )
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="company">Company</option>
                <option value="department">Department</option>
                <option value="personal">Personal</option>
              </select>
            </Field>
          </div>

          <Field label="Display name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              maxLength={120}
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={4}
              className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm"
              maxLength={1000}
            />
          </Field>

          <Field label="Tags" help="Comma-separated">
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="email, draft, sales"
            />
          </Field>

          {scope === "department" ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
              Sprint A: department-scope skills require a department picker
              that lands in sprint B. Use Company or Personal scope for now.
            </p>
          ) : null}

          {create.error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {create.error instanceof ApiCallError
                ? create.error.message
                : "Failed to create"}
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
              onClick={() => create.mutate()}
              disabled={
                !manifestId ||
                !name ||
                !description ||
                !version ||
                create.isPending ||
                scope === "department"
              }
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {create.isPending ? (
                <>
                  <Loader2
                    size={12}
                    strokeWidth={1.75}
                    className="animate-spin"
                  />
                  Creating…
                </>
              ) : (
                "Create"
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

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <div className="mt-1.5">{children}</div>
      {help ? (
        <p className="mt-1 text-xs text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}
