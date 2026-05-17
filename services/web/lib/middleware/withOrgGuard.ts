// withOrgGuard — defensive cross-org check.
// withAuth already injects session.orgId; this middleware rejects requests
// where URL/body params reference a different org (return 404 to not
// reveal cross-org resource existence).

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { BaseContext, Handler } from "./types.ts";

export function withOrgGuard<C extends BaseContext = BaseContext>(
  handler: Handler<C>,
): Handler<C> {
  return async (req, ctx) => {
    const sessionOrgId = ctx.session.orgId;

    // URL search-param check
    const urlOrgId = req.nextUrl.searchParams.get("orgId");
    if (urlOrgId && urlOrgId !== sessionOrgId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Resource not found" } },
        { status: 404 },
      );
    }

    return handler(req, ctx);
  };
}
