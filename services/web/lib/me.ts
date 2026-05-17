// Sprint A client-side aggregation: hub has no GET /api/me equivalent to the
// v0 server route (which returned user + employee + org + pendingCounts in a
// single call). We rebuild that envelope here so existing page.tsx call sites
// keep their useQuery shape — only the queryFn swaps to this helper.
//
// Composition:
//   - org + employee + role:  GET /api/organizations/me
//   - userId:                  GET /api/me/agents (returns rows whose ownerUserId == self; we take the userId from the JS Better Auth session as the source of truth instead)
//   - pendingCounts.inboxApprove:  GET /api/a2a-messages/inbox?tab=approve (length)
//   - pendingCounts.inboxAction:   GET /api/a2a-messages/inbox?tab=action (length)
//
// Concurrent fetch (Promise.all) keeps latency close to a single round-trip.
// W12 / M3 inference helper for /onboarding/state lives in lib/onboarding.ts.

import { api } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";

export interface MeEmployee {
  id: string;
  name: string;
  title: string | null;
  email: string;
  role: "owner" | "admin" | "manager" | "member";
  avatarUrl: string | null;
}

export interface MeOrg {
  id: string;
  name: string;
  slug: string;
}

export interface MeResponse {
  user: { id: string };
  employee: MeEmployee;
  org: MeOrg;
  pendingCounts: { inboxApprove: number; inboxAction: number };
}

interface OrgMeResponse {
  organization: {
    id: string;
    slug: string;
    displayName: string;
  };
  membershipRole: "owner" | "admin" | "manager" | "member";
  employee: {
    id: string;
    userId: string | null;
    name: string;
    title: string | null;
    email: string;
    role: "owner" | "admin" | "manager" | "member";
    avatarUrl: string | null;
  } | null;
}

interface InboxCountResponse {
  items: unknown[];
  nextCursor: string | null;
}

/**
 * Aggregate the v0-equivalent /api/me payload from hub endpoints. Throws if
 * organization/employee can't be resolved (caller should redirect to
 * /onboarding in that case — matches v0 root-gate semantics).
 */
export async function fetchMe(): Promise<MeResponse> {
  const session = await authClient.getSession();
  const userId = session.data?.user.id;
  if (!userId) {
    throw new Error("No active session");
  }

  const [orgMe, approveInbox, actionInbox] = await Promise.all([
    api<OrgMeResponse>("/api/organizations/me"),
    api<InboxCountResponse>("/api/a2a-messages/inbox?tab=approve&limit=1"),
    api<InboxCountResponse>("/api/a2a-messages/inbox?tab=action&limit=1"),
  ]);

  if (!orgMe.employee) {
    throw new Error("No employee profile in this organization");
  }

  return {
    user: { id: userId },
    employee: {
      id: orgMe.employee.id,
      name: orgMe.employee.name,
      title: orgMe.employee.title,
      email: orgMe.employee.email,
      role: orgMe.employee.role,
      avatarUrl: orgMe.employee.avatarUrl,
    },
    org: {
      id: orgMe.organization.id,
      name: orgMe.organization.displayName,
      slug: orgMe.organization.slug,
    },
    // Sprint A uses the returned items.length as the count proxy. The hub inbox
    // endpoint cap is 100 by default; we only need 0/non-zero indication for
    // nav badges, so limit=1 keeps this cheap.
    pendingCounts: {
      inboxApprove: approveInbox.items.length,
      inboxAction: actionInbox.items.length,
    },
  };
}
