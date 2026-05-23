"use client";

// Step 1: create-org.
// Sprint A:
//   v0 POST /api/org  →  hub POST /api/tenants { slug, displayName }
//   v0 set ownerTitle in same call  →  hub: PATCH /api/employees/me after
//     tenant creation (separate call; failure non-blocking — user can edit
//     title later in /settings).

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { api, ApiCallError } from "@/lib/api-client";
import { OnboardingProgress } from "@/components/onboarding/progress";

interface TenantRow {
  id: string;
  slug: string;
  displayName: string;
  plan: string;
  createdAt: string;
}

interface EmployeeRow {
  id: string;
}

export default function CreateOrgStep() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerTitle, setOwnerTitle] = useState("");
  const [touchedSlug, setTouchedSlug] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      // Hub creates tenant + bootstraps owner employee in one call. Owner
      // title isn't part of that contract, so we patch it in afterwards.
      const tenant = await api<TenantRow>("/api/tenants", {
        method: "POST",
        body: { slug, displayName: name },
      });
      if (ownerTitle.trim()) {
        try {
          const me = await api<EmployeeRow>("/api/employees/me");
          await api(`/api/employees/${me.id}`, {
            method: "PATCH",
            body: { title: ownerTitle.trim() },
          });
        } catch (err) {
          // Title is cosmetic — don't fail the whole flow.
          console.warn("[create-org] owner title patch failed", err);
        }
      }
      return tenant;
    },
    onSuccess: () => router.push("/onboarding/import"),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  const onNameChange = (v: string) => {
    setName(v);
    if (!touchedSlug) {
      setSlug(
        v
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 50),
      );
    }
  };

  return (
    <div className="space-y-6">
      <OnboardingProgress current="create-org" />

      <div className="rounded-lg border bg-card p-6">
        <h1 className="font-serif text-xl">Create your organization</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The org is your shared collaboration space — every employee, agent,
          skill, and audit log lives inside it.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label="Organization name" htmlFor="name">
            <input
              id="name"
              type="text"
              required
              minLength={1}
              maxLength={100}
              autoComplete="organization"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
            />
          </Field>

          <Field
            label="Slug"
            htmlFor="slug"
            help="Lowercase letters, digits, hyphens — used in URLs."
          >
            <input
              id="slug"
              type="text"
              required
              pattern="[a-z0-9-]+"
              minLength={1}
              maxLength={50}
              className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
              value={slug}
              onChange={(e) => {
                setTouchedSlug(true);
                setSlug(e.target.value);
              }}
            />
          </Field>

          <Field
            label="Your title (optional)"
            htmlFor="ownerTitle"
          >
            <input
              id="ownerTitle"
              type="text"
              maxLength={80}
              autoComplete="organization-title"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={ownerTitle}
              onChange={(e) => setOwnerTitle(e.target.value)}
              placeholder="e.g. CEO"
            />
          </Field>

          {create.error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {create.error instanceof ApiCallError
                ? create.error.message
                : "Failed to create organization"}
            </div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={create.isPending || !name || !slug}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {create.isPending ? "Creating…" : "Create organization →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  help,
  children,
}: {
  label: string;
  htmlFor: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {help ? (
        <p className="mt-1 text-xs text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}
