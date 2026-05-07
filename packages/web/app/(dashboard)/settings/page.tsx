"use client";

// /settings — account profile + organization settings + sign out.
// Account: name + title editable (PUT /api/me); email read-only.
// Organization: name + slug editable for owner/admin (PUT /api/org).
// Sign out: better-auth client.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, LogOut, Save, X } from "lucide-react";

import { api, ApiCallError } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MeResponse {
  user: { id: string };
  employee: {
    id: string;
    name: string;
    title: string | null;
    email: string;
    role: "owner" | "admin" | "manager" | "employee" | "auditor";
    avatarUrl: string | null;
  };
  org: { id: string; name: string; slug: string };
}

interface OrgResponse {
  id: string;
  name: string;
  slug: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeResponse>("/api/me"),
  });

  const isPrivileged =
    me.data?.employee.role === "owner" || me.data?.employee.role === "admin";

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center border-b bg-card px-6">
        <h1 className="font-serif text-lg leading-tight tracking-tight">
          Settings
        </h1>
      </header>

      <div className="flex-1 overflow-y-auto px-6 pb-12 pt-6">
        {me.isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2
              size={16}
              strokeWidth={1.75}
              className="mr-2 animate-spin"
            />
            Loading…
          </div>
        ) : me.error ? (
          <ErrorBox error={me.error} />
        ) : me.data ? (
          <div className="mx-auto max-w-2xl space-y-8">
            <AccountSection
              employee={me.data.employee}
              onSaved={() =>
                queryClient.invalidateQueries({ queryKey: ["me"] })
              }
            />

            {isPrivileged ? (
              <OrgSection
                orgId={me.data.org.id}
                initialName={me.data.org.name}
                initialSlug={me.data.org.slug}
                onSaved={() =>
                  queryClient.invalidateQueries({ queryKey: ["me"] })
                }
              />
            ) : null}

            <DangerSection
              onSignedOut={() => {
                queryClient.clear();
                router.replace("/login");
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AccountSection({
  employee,
  onSaved,
}: {
  employee: MeResponse["employee"];
  onSaved: () => void;
}) {
  const [name, setName] = useState(employee.name);
  const [title, setTitle] = useState(employee.title ?? "");
  const [avatarUrl, setAvatarUrl] = useState(employee.avatarUrl ?? "");
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => {
    setName(employee.name);
    setTitle(employee.title ?? "");
    setAvatarUrl(employee.avatarUrl ?? "");
  }, [employee.name, employee.title, employee.avatarUrl]);

  const dirty =
    name !== employee.name ||
    (title || "") !== (employee.title ?? "") ||
    (avatarUrl || "") !== (employee.avatarUrl ?? "");

  const initials = employee.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const save = useMutation({
    mutationFn: () =>
      api("/api/me", {
        method: "PUT",
        body: {
          name,
          title: title || undefined,
          avatarUrl: avatarUrl || undefined,
        },
      }),
    onSuccess: () => onSaved(),
  });

  return (
    <Section title="Account" description="Your personal profile in this organization.">
      <div className="flex items-center gap-3">
        <Avatar className="size-14">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="text-xs text-muted-foreground">
          Paste an HTTPS image URL (e.g. Gravatar, S3, your CDN).
        </div>
      </div>

      <Field label="Avatar URL" help="Leave empty to use your initials.">
        <input
          type="url"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://…"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </Field>

      <Field label="Email" help="Managed by your sign-in account.">
        <input
          type="text"
          value={employee.email}
          disabled
          className="w-full cursor-not-allowed rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
        />
      </Field>

      <Field label="Role">
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm capitalize">
          {employee.role}
        </div>
      </Field>

      <Field label="Display name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </Field>

      <Field label="Title" help="e.g. CEO, Sales Manager.">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </Field>

      {save.error ? <ErrorInline error={save.error} /> : null}

      <div className="flex items-center justify-between gap-2 border-t pt-4">
        <button
          type="button"
          onClick={() => setPwOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs hover:bg-secondary"
        >
          <KeyRound size={12} strokeWidth={1.75} />
          Change password
        </button>
        <button
          type="button"
          disabled={!dirty || save.isPending || !name.trim()}
          onClick={() => save.mutate()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {save.isPending ? (
            <>
              <Loader2
                size={12}
                strokeWidth={1.75}
                className="animate-spin"
              />
              Saving…
            </>
          ) : (
            <>
              <Save size={12} strokeWidth={1.75} />
              Save changes
            </>
          )}
        </button>
      </div>

      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </Section>
  );
}

function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setErr(null);
    }
  }, [open]);

  const submit = async () => {
    setErr(null);
    if (next.length < 12) {
      setErr("New password must be at least 12 characters.");
      return;
    }
    if (next !== confirm) {
      setErr("New password and confirmation do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (res.error) {
        setErr(res.error.message ?? "Change password failed.");
        return;
      }
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Change password failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Current password">
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>

          <Field label="New password" help="At least 12 characters.">
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={12}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Confirm new password">
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </Field>

          <p className="text-xs text-muted-foreground">
            All other sessions will be signed out.
          </p>

          {err ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {err}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || !current || !next || !confirm}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? (
                <Loader2
                  size={12}
                  strokeWidth={1.75}
                  className="animate-spin"
                />
              ) : null}
              Change password
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

function OrgSection({
  orgId,
  initialName,
  initialSlug,
  onSaved,
}: {
  orgId: string;
  initialName: string;
  initialSlug: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);

  useEffect(() => {
    setName(initialName);
    setSlug(initialSlug);
  }, [initialName, initialSlug]);

  const dirty = name !== initialName || slug !== initialSlug;

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, string> = {};
      if (name !== initialName) body.name = name;
      if (slug !== initialSlug) body.slug = slug;
      return api<OrgResponse>("/api/org", { method: "PUT", body });
    },
    onSuccess: () => onSaved(),
  });

  return (
    <Section
      title="Organization"
      description="These changes affect every member of your org."
    >
      <Field label="Org ID">
        <div className="rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
          {orgId}
        </div>
      </Field>

      <Field label="Organization name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </Field>

      <Field
        label="Slug"
        help="Lowercase letters, digits, hyphens — used in URLs."
      >
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          pattern="[a-z0-9-]+"
          maxLength={50}
          className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
        />
      </Field>

      {save.error ? <ErrorInline error={save.error} /> : null}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!dirty || save.isPending || !name.trim() || !slug.trim()}
          onClick={() => save.mutate()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {save.isPending ? (
            <>
              <Loader2
                size={12}
                strokeWidth={1.75}
                className="animate-spin"
              />
              Saving…
            </>
          ) : (
            <>
              <Save size={12} strokeWidth={1.75} />
              Save changes
            </>
          )}
        </button>
      </div>
    </Section>
  );
}

function DangerSection({ onSignedOut }: { onSignedOut: () => void }) {
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await authClient.signOut();
    } finally {
      setBusy(false);
      onSignedOut();
    }
  };

  return (
    <Section title="Sign out" description="End this browser session.">
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive hover:bg-destructive/20 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 size={12} strokeWidth={1.75} className="animate-spin" />
        ) : (
          <LogOut size={12} strokeWidth={1.75} />
        )}
        Sign out
      </button>
    </Section>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-6">
      <header className="mb-5 border-b pb-3">
        <h2 className="font-serif text-base">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
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

function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="rounded-lg border bg-card p-6 text-sm text-destructive">
      {error instanceof ApiCallError ? error.message : "Failed to load"}
    </div>
  );
}

function ErrorInline({ error }: { error: unknown }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {error instanceof ApiCallError ? error.message : "Save failed"}
    </div>
  );
}
