// Middleware barrel + composition helper.
//
// Standard chain (web UI route):
//   export const POST = withAuth(withOrgGuard(withRBAC(['admin'])(handler)));
//
// Agent route:
//   export const POST = withAuth(withScope('send_a2a_commit')(handler));
//
// A2A endpoint:
//   export const POST = withAuth(withSenderSignature(handler));

export * from "./types.ts";
export { withAuth } from "./withAuth.ts";
export { withOrgGuard } from "./withOrgGuard.ts";
export { withRBAC } from "./withRBAC.ts";
export { withScope } from "./withScope.ts";
export { withSenderSignature } from "./withSenderSignature.ts";
