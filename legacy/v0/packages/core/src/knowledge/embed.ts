// Batch-embed chunks via Vercel AI Gateway.
// Default provider: voyage/voyage-3-large (1024 dim via Matryoshka truncation).
// On gateway failure, retry handled by AI SDK. Caller decides what to do
// with throw — no silent fallback to mock embeddings.

import { embedManyHelper } from "../llm/helper.ts";

export const EMBED_DIM = 1024;
export const DEFAULT_EMBED_MODEL = "voyage/voyage-3-large";
export const BATCH_SIZE = 32;

/**
 * Embed an array of chunk content strings. Returns parallel array of vectors.
 * Truncates each input to 8000 chars (voyage hard limit).
 */
export async function embedChunks(
  texts: string[],
  opts: { model?: string } = {},
): Promise<number[][]> {
  const truncated = texts.map((t) =>
    t.length > 8000 ? t.slice(0, 8000) : t,
  );
  const out: number[][] = [];
  for (let i = 0; i < truncated.length; i += BATCH_SIZE) {
    const batch = truncated.slice(i, i + BATCH_SIZE);
    const result = await embedManyHelper(batch, {
      model: opts.model ?? DEFAULT_EMBED_MODEL,
    });
    for (const v of result.embeddings) {
      const arr = v as unknown as number[];
      // Defensive truncation if provider returned higher-dim
      out.push(arr.length > EMBED_DIM ? arr.slice(0, EMBED_DIM) : arr);
    }
  }
  return out;
}

/** Embed a single query for similarity search. */
export async function embedQuery(
  text: string,
  opts: { model?: string } = {},
): Promise<number[]> {
  const result = await embedManyHelper([text.slice(0, 8000)], {
    model: opts.model ?? DEFAULT_EMBED_MODEL,
  });
  const v = result.embeddings[0] as unknown as number[];
  return v.length > EMBED_DIM ? v.slice(0, EMBED_DIM) : v;
}
