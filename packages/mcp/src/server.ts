#!/usr/bin/env node
// MCP server for firefly-mesh.
//
// Exposes the same tools as @firefly-mesh/skill under the firefly_*
// namespace (MCP convention prefers underscores), backed by the same
// HTTP API.
//
// Default transport: stdio (for Cursor / Claude Desktop / etc.).
// Boot: `firefly-mesh-mcp` (after `npm install -g @firefly-mesh/mcp`).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  FireflyMeshClient,
  type ClientOpts,
  TaskApproveDispatchRequest,
  TaskDispatchRequest,
  TaskSubmitRequest,
  A2AContent,
  A2AMessageType,
  InboxTab,
  KnowledgeSearchRequest,
} from "@firefly-mesh/sdk";

import { resolveAuthFromEnv } from "./auth/token.ts";

export interface McpBootOpts {
  /** Pre-authenticated firefly-mesh client opts. */
  clientOpts: ClientOpts;
  /** Server name advertised over MCP (default: firefly-mesh). */
  serverName?: string;
}

/**
 * Build an MCP server bound to a firefly-mesh deployment.
 * Caller can connect any MCP transport (stdio, HTTP/SSE, etc.).
 */
export function createMcpServer(opts: McpBootOpts): McpServer {
  const client = new FireflyMeshClient(opts.clientOpts);
  const server = new McpServer({
    name: opts.serverName ?? "firefly-mesh",
    version: "0.1.0",
  });

  // ---- Task ----
  server.registerTool(
    "firefly_task_dispatch",
    {
      description:
        "Submit a high-level task description. Server LLM-decomposes into 2-7 subtasks and awaits creator approval (HITL point 1).",
      inputSchema: TaskDispatchRequest.shape,
    },
    async (input) => {
      const out = await client.task.dispatch(input);
      return {
        content: [
          { type: "text", text: JSON.stringify(out.data, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "firefly_task_approve_dispatch",
    {
      description:
        "(HITL 1, sender side.) Approve a previously submitted decomposition. Optionally edit subtask titles / summaries / assignees.",
      inputSchema: {
        taskId: z.string().uuid(),
        ...TaskApproveDispatchRequest.shape,
      },
    },
    async ({ taskId, ...rest }) => {
      const out = await client.task.approveDispatch(taskId, rest);
      return {
        content: [
          { type: "text", text: JSON.stringify(out.data, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "firefly_task_list",
    {
      description:
        "List tasks visible to you (auto-filtered by org + RBAC).",
      inputSchema: {
        employeeId: z.string().uuid().optional(),
        status: z.string().optional(),
        cursor: z.string().optional(),
      },
    },
    async (input) => {
      const out = await client.task.list(input);
      return {
        content: [
          { type: "text", text: JSON.stringify(out.data, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "firefly_task_submit",
    {
      description:
        "Submit your work product on an assigned task. Triggers HITL point 2 (creator review).",
      inputSchema: {
        taskId: z.string().uuid(),
        ...TaskSubmitRequest.shape,
      },
    },
    async ({ taskId, ...rest }) => {
      const out = await client.task.submit(taskId, rest);
      return {
        content: [
          { type: "text", text: JSON.stringify(out.data, null, 2) },
        ],
      };
    },
  );

  // ---- A2A ----
  server.registerTool(
    "firefly_a2a_send",
    {
      description:
        "Send a typed A2A message to a colleague's agent. Caller must sign the canonicalized body.",
      inputSchema: {
        receiverEmployeeId: z.string().uuid().optional(),
        receiverAgentId: z.string().uuid().optional(),
        threadId: z.string().uuid().optional(),
        replyToMessageId: z.string().uuid().optional(),
        type: A2AMessageType,
        content: A2AContent,
        relatedTaskId: z.string().uuid().optional(),
        signature: z.string().min(1),
      },
    },
    async (input) => {
      const out = await client.a2a.send(input);
      return {
        content: [
          { type: "text", text: JSON.stringify(out.data, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "firefly_a2a_inbox",
    {
      description:
        "Read incoming A2A messages. Tabs: needs_action / pending_outbound / informational / all.",
      inputSchema: {
        employeeId: z.string().uuid().optional(),
        tab: InboxTab.optional(),
        cursor: z.string().optional(),
      },
    },
    async (input) => {
      const out = await client.a2a.inbox(input);
      return {
        content: [
          { type: "text", text: JSON.stringify(out.data, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "firefly_a2a_approve",
    {
      description:
        "(Sender side.) Approve a queued outbound message awaiting your sign-off.",
      inputSchema: { messageId: z.string().uuid() },
    },
    async ({ messageId }) => {
      const out = await client.a2a.approve(messageId);
      return {
        content: [
          { type: "text", text: JSON.stringify(out.data, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "firefly_a2a_accept",
    {
      description:
        "(Receiver side.) Accept an inbound request / handoff / commit.",
      inputSchema: { messageId: z.string().uuid() },
    },
    async ({ messageId }) => {
      const out = await client.a2a.accept(messageId);
      return {
        content: [
          { type: "text", text: JSON.stringify(out.data, null, 2) },
        ],
      };
    },
  );

  // ---- Skill ----
  server.registerTool(
    "firefly_skill_loaded",
    {
      description:
        "List the firefly-mesh skills active for an employee (Personal > Department > Company).",
      inputSchema: { employeeId: z.string().uuid().optional() },
    },
    async ({ employeeId }) => {
      const out = await client.skill.loaded(employeeId);
      return {
        content: [
          { type: "text", text: JSON.stringify(out.data, null, 2) },
        ],
      };
    },
  );

  // ---- KB ----
  server.registerTool(
    "firefly_kb_search",
    {
      description:
        "Search the org / department / personal knowledge base. (M7 — MVP returns empty.)",
      inputSchema: KnowledgeSearchRequest.shape,
    },
    async (input) => {
      const out = await client.kb.search(input);
      return {
        content: [
          { type: "text", text: JSON.stringify(out.data, null, 2) },
        ],
      };
    },
  );

  return server;
}

// CLI entry point. Reads auth from env, mounts stdio transport.
async function main(): Promise<void> {
  const auth = resolveAuthFromEnv();
  const server = createMcpServer({
    clientOpts: { baseUrl: auth.baseUrl, token: auth.jwt },
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isMain =
  process.argv[1] !== undefined &&
  /server\.ts$|server\.js$|firefly-mesh-mcp$/.test(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error("[firefly-mesh-mcp] fatal:", err);
    process.exit(1);
  });
}
