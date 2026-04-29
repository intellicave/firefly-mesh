#!/usr/bin/env -S tsx
// Smoke test for Vercel AI Gateway routing.
// Verifies AI_GATEWAY_API_KEY is valid and gateway routes anthropic/* correctly.
//
// Run: pnpm --filter @firefly-mesh/core exec tsx src/llm/smoke.ts

import { generateTextHelper } from "./helper.ts";

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY) {
    console.error(
      "AI_GATEWAY_API_KEY is not set. See env-capabilities.yaml#ai_gateway",
    );
    process.exit(1);
  }

  console.log("Smoke test: AI Gateway → anthropic/claude-sonnet-4-6");
  const start = Date.now();

  const result = await generateTextHelper("say hi in exactly 5 words", {
    maxRetries: 3,
  });

  const elapsed = Date.now() - start;
  console.log(`OK (${elapsed}ms)`);
  console.log("Response:", result.text);
  console.log("Usage:", result.usage);
  console.log("Finish:", result.finishReason);
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
