// withScope — agent boundary scope check.
// Applies only to agent mode; returns 403 INSUFFICIENT_SCOPE if the agent
// JWT's scopes don't contain the required scope.

import { NextResponse } from "next/server";

import { isValidScope } from "@firefly-mesh/core/boundary/catalog";

import type { BaseContext, Handler } from "./types.ts";
import { isAgentSession } from "./types.ts";

export function withScope<C extends BaseContext = BaseContext>(
  required: string,
) {
  if (!isValidScope(required)) {
    throw new Error(
      `withScope: '${required}' is not in SCOPE_CATALOG (boundary/catalog.ts)`,
    );
  }

  return (handler: Handler<C>): Handler<C> => {
    return async (req, ctx) => {
      if (!isAgentSession(ctx.session)) {
        return NextResponse.json(
          {
            error: {
              code: "FORBIDDEN",
              message: "Scope-guarded route requires agent token",
            },
          },
          { status: 403 },
        );
      }

      if (!ctx.session.scopes.includes(required)) {
        return NextResponse.json(
          {
            error: {
              code: "INSUFFICIENT_SCOPE",
              message: `Agent missing scope '${required}'`,
            },
          },
          { status: 403 },
        );
      }

      return handler(req, ctx);
    };
  };
}
