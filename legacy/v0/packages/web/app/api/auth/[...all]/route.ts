// Better Auth Next.js handler — mounts all auth endpoints under /api/auth/*.

import { auth } from "@firefly-mesh/core/auth/better-auth";

export const GET = auth.handler;
export const POST = auth.handler;
