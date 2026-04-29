// @firefly-mesh/sdk — typed HTTP client + zod schemas.
// Used by skill / mcp packages and external developers.

export * from "./schema/task.ts";
export * from "./schema/a2a.ts";
export * from "./schema/skill.ts";
export * from "./schema/audit.ts";
export * from "./schema/knowledge.ts";

export {
  FireflyMeshClient,
  FireflyMeshError,
  type ClientOpts,
} from "./client/http.ts";
export {
  subscribeSSE,
  type SSEOpts,
  type SSESubscription,
} from "./client/sse.ts";
