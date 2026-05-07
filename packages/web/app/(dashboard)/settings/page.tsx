"use client";

// /settings — account profile + organization settings + sign out.
// Account: name + title editable (PUT /api/me); email read-only.
// Organization: name + slug editable for owner/admin (PUT /api/org).
// Sign out: better-auth client.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, Save } from "lucide-react";

import { api, ApiCallError } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";

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

  useEffect(() => {
    setName(employee.name);
    setTitle(employee.title ?? "");
  }, [employee.name, employee.title]);

  const dirty = name !== employee.name || (title || "") !== (employee.title ?? "");

  const save = useMutation({
    mutationFn: () =>
      api("/api/me", {
        method: "PUT",
        body: { name, title: title || undefined },
      }),
    onSuccess: () => onSaved(),
  });

  return (
    <Section title="Account" description="Your personal profile in this organization.">
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

      <div className="flex justify-end">
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
    </Section>
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
