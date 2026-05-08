export { HubHttpClient } from "./http-client.ts";
export type { HubHttpClientOptions } from "./http-client.ts";

export { createOpenClawAdapter } from "./adapters/openclaw.ts";
export type {
  OpenClawAdapter,
  SendMessageOptions,
  SendMessageResponse,
  GetInboxOptions,
  InboxPage,
} from "./adapters/openclaw.ts";

export { createMcpAdapter } from "./adapters/mcp.ts";
export type {
  McpAdapter,
  McpSendMessageOptions,
  McpSendMessageResponse,
  McpGetInboxOptions,
  McpInboxPage,
} from "./adapters/mcp.ts";
