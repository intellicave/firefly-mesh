// Toolless LLM helper for firefly-mesh server.
//
// Per rules.md R7 (BYO-agent enforcement): server must NOT run ToolLoopAgent.
// Agent runtime lives client-side (OpenClaw / Hermes / Cursor / etc).
// Server only does stateless LLM calls: generateText / generateObject /
// embedMany / streamText.
//
// All calls route through Vercel AI Gateway (AI_GATEWAY_API_KEY env).

import {
  embedMany,
  generateObject,
  generateText,
  streamText,
  type LanguageModel,
} from "ai";
import type { ZodType } from "zod";

export interface LLMOpts {
  /** Gateway-prefixed model id, e.g. "anthropic/claude-sonnet-4-6". */
  model?: string;
  /** Retry attempts on provider error. AI Gateway also failovers internally. */
  maxRetries?: number;
}

const DEFAULT_TEXT_MODEL = "anthropic/claude-sonnet-4-6";
const DEFAULT_EMBED_MODEL = "voyage/voyage-3-large";

export async function generateTextHelper(prompt: string, opts: LLMOpts = {}) {
  const result = await generateText({
    model: (opts.model ?? DEFAULT_TEXT_MODEL) as unknown as LanguageModel,
    prompt,
    maxRetries: opts.maxRetries ?? 3,
  });
  return {
    text: result.text,
    usage: result.usage,
    finishReason: result.finishReason,
  };
}

export async function generateObjectHelper<T>(
  prompt: string,
  schema: ZodType<T>,
  opts: LLMOpts = {},
) {
  const result = await generateObject({
    model: (opts.model ?? DEFAULT_TEXT_MODEL) as unknown as LanguageModel,
    schema,
    prompt,
    maxRetries: opts.maxRetries ?? 3,
  });
  return {
    object: result.object,
    usage: result.usage,
  };
}

export async function embedManyHelper(
  texts: string[],
  opts: { model?: string } = {},
) {
  const result = await embedMany({
    model: (opts.model ?? DEFAULT_EMBED_MODEL) as never,
    values: texts,
  });
  return {
    embeddings: result.embeddings,
    usage: result.usage,
  };
}

export { streamText };
