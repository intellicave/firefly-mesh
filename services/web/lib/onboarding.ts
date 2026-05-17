// Sprint A client-side aggregation for the legacy /api/onboarding/state.
// M3 reviewer fix: hub has no aggregate endpoint; recovery is via parallel
// fetches + the strict inference rule in plan.md A.9.3.1. Encapsulating the
// rule here keeps the wizard page minimally changed (only the queryFn swaps).

import { api, ApiCallError } from "@/lib/api-client";

export type OnboardingStep = "create-org" | "import" | "tokens" | "done";

export interface OnboardingStateResponse {
  step: OnboardingStep;
  completed: boolean;
  orgId: string | null;
}

interface OrgMeResponse {
  organization: { id: string };
  membershipRole: "owner" | "admin" | "manager" | "member";
  employee: { id: string } | null;
}

/**
 * Step inference (plan.md A.9.3.1 + v0 RBAC short-circuit retained):
 *   /api/organizations/me 404                                    → create-org
 *   role NOT in {owner, admin} (joined via invite)               → done
 *     (non-privileged users have no power to run import/tokens steps;
 *     v0 route 25c5d36 had the same `isPrivileged` guard.)
 *   /api/organizations/me 200 && /api/employees length === 0     → import
 *   /api/employees length ≥ 1 && /api/me/agents length === 0     → tokens
 *   /api/me/agents length ≥ 1                                    → done
 */
export async function fetchOnboardingState(): Promise<OnboardingStateResponse> {
  // Step 1: organization?
  let orgMe: OrgMeResponse;
  try {
    orgMe = await api<OrgMeResponse>("/api/organizations/me");
  } catch (e) {
    if (e instanceof ApiCallError && e.status === 404) {
      return { step: "create-org", completed: false, orgId: null };
    }
    throw e;
  }

  const orgId = orgMe.organization.id;

  // Non-privileged users skip import + tokens (they can't perform them).
  // This matches v0 /api/onboarding/state behavior where members invited
  // into an existing org go straight to /inbox once they have an employee.
  const isPrivileged =
    orgMe.membershipRole === "owner" || orgMe.membershipRole === "admin";
  if (!isPrivileged) {
    return { step: "done", completed: true, orgId };
  }

  // Step 2: employees in this org?
  const employees = await api<Array<unknown>>("/api/employees?limit=1");
  if (employees.length === 0) {
    return { step: "import", completed: false, orgId };
  }

  // Step 3: any agents on this user?
  const agents = await api<Array<unknown>>("/api/me/agents");
  if (agents.length === 0) {
    return { step: "tokens", completed: false, orgId };
  }

  return { step: "done", completed: true, orgId };
}
