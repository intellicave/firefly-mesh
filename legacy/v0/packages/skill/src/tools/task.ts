// firefly.task.* tools — exposed to the host LLM via agentskills.io runtime.
//
// Each tool has:
//   - name (e.g. "firefly.task.dispatch")
//   - inputSchema (zod) — used by runtime to generate tool-call signature
//   - description (LLM-facing)
//   - handler (calls firefly-mesh HTTPS API)
//
// The runtime adapts these into its native tool format
// (OpenClaw / Hermes / Claude Code each have different glue).

import { z } from "zod";

import { FireflyMeshClient } from "../client/http.ts";
import {
  TaskApproveDispatchRequest,
  TaskDispatchRequest,
  TaskSubmitRequest,
} from "@firefly-mesh/sdk";

export interface ToolContext {
  client: FireflyMeshClient;
}

export const dispatch = {
  name: "firefly.task.dispatch",
  description:
    "Submit a high-level task description to your firefly-mesh organization. " +
    "Server LLM-decomposes into 2-7 subtasks and awaits creator approval. " +
    "Returns the rootTaskId you can poll + the proposed decomposition.",
  inputSchema: TaskDispatchRequest,
  async handler(ctx: ToolContext, input: z.infer<typeof TaskDispatchRequest>) {
    return ctx.client.task.dispatch(input);
  },
};

const ApproveDispatchInput = TaskApproveDispatchRequest.extend({
  taskId: z.string().uuid(),
});
export const approveDispatch = {
  name: "firefly.task.approveDispatch",
  description:
    "(HITL point 1, sender side.) Approve a previously submitted decomposition. " +
    "Optionally edit subtask titles / summaries / assignees before approval. " +
    "Returns child tasks created + handoff messages routed.",
  inputSchema: ApproveDispatchInput,
  async handler(ctx: ToolContext, input: z.infer<typeof ApproveDispatchInput>) {
    const { taskId, ...rest } = input;
    return ctx.client.task.approveDispatch(taskId, rest);
  },
};

const ListInput = z.object({
  employeeId: z.string().uuid().optional(),
  status: z.string().optional(),
  cursor: z.string().optional(),
});
export const list = {
  name: "firefly.task.list",
  description:
    "List tasks visible to you (auto-filtered by org + RBAC). " +
    "Default scope is your own assigned + created tasks.",
  inputSchema: ListInput,
  async handler(ctx: ToolContext, input: z.infer<typeof ListInput>) {
    return ctx.client.task.list(input);
  },
};

const SubmitInput = TaskSubmitRequest.extend({
  taskId: z.string().uuid(),
});
export const submit = {
  name: "firefly.task.submit",
  description:
    "Submit your work product on an assigned task. Triggers HITL point 2 — " +
    "the creator reviews/approves before the task moves to 'completed'.",
  inputSchema: SubmitInput,
  async handler(ctx: ToolContext, input: z.infer<typeof SubmitInput>) {
    const { taskId, ...rest } = input;
    return ctx.client.task.submit(taskId, rest);
  },
};

export const taskTools = [dispatch, approveDispatch, list, submit];
