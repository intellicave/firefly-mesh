import { taskTools } from "./task.ts";
import { a2aTools } from "./a2a.ts";
import { skillTools } from "./skill.ts";
import { kbTools } from "./kb.ts";

export * from "./task.ts";
export * from "./a2a.ts";
export * from "./skill.ts";
export * from "./kb.ts";

/**
 * The full toolset the skill exposes. Runtimes call this to register tools
 * with the host LLM under the firefly.* namespace.
 */
export const allTools = [
  ...taskTools,
  ...a2aTools,
  ...skillTools,
  ...kbTools,
];
