// @firefly-mesh/skill — agentskills.io entry point.
//
// Runtime activation flow:
//   1) Runtime parses SKILL.md manifest → discovers required inputs (baseUrl + token).
//   2) Runtime calls activate({ baseUrl, oneTimeToken, runtimeKind, publicKey })
//      → gets back agent JWT.
//   3) Runtime constructs createSkill({ baseUrl, jwt }) and registers
//      `allTools` with its host LLM under the firefly.* namespace.

import { FireflyMeshClient } from "./client/http.ts";
import { allTools } from "./tools/index.ts";
import type { ToolContext } from "./tools/task.ts";

export interface SkillBootOpts {
  baseUrl: string;
  jwt: string;
  /** Optional fetch override for tests / non-Node runtimes. */
  fetch?: typeof fetch;
}

export interface BoundTool {
  name: string;
  description: string;
  inputSchema: unknown;
  invoke: (input: unknown) => Promise<unknown>;
}

/**
 * Bind the firefly toolset to a deployment + token. Returns a list of
 * runtime-friendly tool descriptors (each has .invoke pre-bound to the
 * authenticated client). Runtimes register these with their host LLM.
 */
export function createSkill(opts: SkillBootOpts): {
  client: FireflyMeshClient;
  tools: BoundTool[];
} {
  const client = new FireflyMeshClient({
    baseUrl: opts.baseUrl,
    token: opts.jwt,
    fetch: opts.fetch,
  });
  const ctx: ToolContext = { client };

  const bound: BoundTool[] = allTools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    invoke: async (input) => {
      const parsed = (t.inputSchema as { parse: (v: unknown) => unknown }).parse(
        input,
      );
      return (
        t.handler as (ctx: ToolContext, parsed: unknown) => Promise<unknown>
      )(ctx, parsed);
    },
  }));

  return { client, tools: bound };
}

export { allTools } from "./tools/index.ts";
export {
  activate,
  memoryTokenStore,
  type ActivationOpts,
  type ActivationResult,
  type TokenStore,
} from "./client/auth.ts";
export {
  canonicalize,
  signPayload,
  FireflyMeshClient,
  FireflyMeshError,
} from "./client/http.ts";
export { subscribeSSE } from "./client/sse.ts";
