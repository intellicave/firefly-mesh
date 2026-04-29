// withRBAC — role check for user-cookie-authenticated routes.
// Applies only to user mode (returns 403 for agent mode — agent routes
// should use withScope instead).

import { NextResponse } from "next/server";

import type { BaseContext, Handler, UserSession } from "./types.ts";
import { isUserSession } from "./types.ts";

export type Role = UserSession["role"];

export function withRBAC<C extends BaseContext = BaseContext>(
  allowedRoles: readonly Role[],
) {
  return (handler: Handler<C>): Handler<C> => {
    return async (req, ctx) => {
      if (!isUserSession(ctx.session)) {
        return NextResponse.json(
          {
            error: {
              code: "FORBIDDEN",
              message: "RBAC route requires user session, not agent token",
            },
          },
          { status: 403 },
        );
      }

      if (!allowedRoles.includes(ctx.session.role)) {
        return NextResponse.json(
          {
            error: {
              code: "FORBIDDEN",
              message: `Role '${ctx.session.role}' not in [${allowedRoles.join(", ")}]`,
            },
          },
          { status: 403 },
        );
      }

      return handler(req, ctx);
    };
  };
}
