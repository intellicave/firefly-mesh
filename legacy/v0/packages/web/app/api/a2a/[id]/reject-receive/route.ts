// POST /api/a2a/{id}/reject-receive — receiver rejects (refuses action).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  rejectReceiverSide,
  hitlErrorToHttp,
} from "@firefly-mesh/core/hitl/engine";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { isUserSession } from "@/lib/middleware/types";

function parseMessageId(req: NextRequest): string | null {
  const segs = req.nextUrl.pathname.split("/");
  const id = segs[segs.length - 2];
  if (!id || !z.string().uuid().safeParse(id).success) return null;
  return id;
}

const Body = z.object({ comment: z.string().max(2000).optional() });

export const POST = withAuth(
  withOrgGuard(async (req: NextRequest, ctx) => {
    if (!isUserSession(ctx.session)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN" } },
        { status: 403 },
      );
    }
    const id = parseMessageId(req);
    if (!id) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR" } },
        { status: 400 },
      );
    }

    let body: { comment?: string } = {};
    try {
      const parsed = Body.safeParse(await req.json());
      if (parsed.success) body = parsed.data;
    } catch {
      // ok
    }

    const result = await rejectReceiverSide(
      id,
      ctx.session.employeeId,
      ctx.session.orgId,
      body.comment,
    );

    if (!result.ok) {
      const mapped = hitlErrorToHttp(result.error!);
      return NextResponse.json(
        { error: { code: mapped.code, message: mapped.message } },
        { status: mapped.status },
      );
    }

    return NextResponse.json({ data: { id, status: "rejected" } });
  }),
);
