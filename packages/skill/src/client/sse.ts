// Re-export SSE subscription helper from SDK so skill tools have one
// import path for everything HTTP-shaped.

export {
  subscribeSSE,
  type SSEOpts,
  type SSESubscription,
} from "@firefly-mesh/sdk";
