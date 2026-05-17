// Shared middleware types.

import type { NextRequest } from "next/server";

export interface UserSession {
  userId: string;
  employeeId: string;
  orgId: string;
  role: "owner" | "admin" | "manager" | "employee" | "auditor";
}

export interface AgentSession {
  agentId: string;
  employeeId: string;
  orgId: string;
  scopes: string[];
}

export type AuthMode = "user" | "agent";

export interface BaseContext {
  session: UserSession | AgentSession;
  authMode: AuthMode;
}

export type Handler<C extends BaseContext = BaseContext> = (
  req: NextRequest,
  ctx: C,
) => Promise<Response>;

export function isUserSession(s: UserSession | AgentSession): s is UserSession {
  return "userId" in s;
}

export function isAgentSession(
  s: UserSession | AgentSession,
): s is AgentSession {
  return "agentId" in s;
}
