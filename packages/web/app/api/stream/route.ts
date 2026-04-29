// SSE handler (M1-5).
// Subscribes the connection to one topic and forwards events from the
// in-memory event bus. Keep-alive every 30s per api.md §3.3.

import { NextRequest } from "next/server";
import { bus } from "@firefly-mesh/core/events/bus";

export const dynamic = "force-dynamic";

const KEEPALIVE_INTERVAL_MS = 30_000;

export async function GET(req: NextRequest) {
  const topic = req.nextUrl.searchParams.get("topic");
  if (!topic) {
    return new Response(
      JSON.stringify({
        error: { code: "VALIDATION_ERROR", message: "topic is required" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();
  let keepalive: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // initial keep-alive primes the stream
      controller.enqueue(encoder.encode(":connected\n\n"));

      unsubscribe = bus.subscribe(topic, (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // controller may be closed; ignore
        }
      });

      keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(":keepalive\n\n"));
        } catch {
          // ignore
        }
      }, KEEPALIVE_INTERVAL_MS);
    },
    cancel() {
      if (keepalive) clearInterval(keepalive);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
