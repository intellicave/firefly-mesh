// firefly.kb.* tools — knowledge base search.
// MVP: server returns empty arrays (KB pipeline ships in M7).
// Tool signature is final so installed agents won't break when M7 lands.

import { z } from "zod";

import { KnowledgeSearchRequest } from "@firefly-mesh/sdk";
import type { ToolContext } from "./task.ts";

export const search = {
  name: "firefly.kb.search",
  description:
    "Search the org / department / personal knowledge base. " +
    "Returns up to topK most relevant chunks with source attribution. " +
    "Default scope: 'all' (Personal > Department > Company precedence applied).",
  inputSchema: KnowledgeSearchRequest,
  async handler(
    ctx: ToolContext,
    input: z.infer<typeof KnowledgeSearchRequest>,
  ) {
    return ctx.client.kb.search(input);
  },
};

export const kbTools = [search];
