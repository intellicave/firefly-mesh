// fetch-based typed HTTP client for firefly-mesh.
// Used by packages/skill, packages/mcp, and external developers.
//
// All methods accept a FireflyClient context (baseUrl + bearer token) +
// validate responses with the same zod schemas the server uses.

import {
  TaskApproveDispatchRequest,
  TaskDispatchRequest,
  TaskDispatchResponse,
  TaskListResponse,
  TaskSubmitRequest,
} from "../schema/task.ts";
import {
  A2ASendRequest,
  A2ASendResponse,
  InboxResponse,
  InboxTab,
} from "../schema/a2a.ts";
import { SkillLoadedResponse } from "../schema/skill.ts";
import {
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
} from "../schema/knowledge.ts";
import { AuditListResponse } from "../schema/audit.ts";

import { z } from "zod";

export interface ClientOpts {
  /** Base URL of the firefly-mesh deployment (e.g. https://mesh.acme.io). */
  baseUrl: string;
  /** Bearer token (agent JWT from /api/agent/activate, or user session cookie via fetch). */
  token: string;
  /** Optional fetch impl override (for tests / non-Node runtimes). */
  fetch?: typeof fetch;
}

export class FireflyMeshError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "FireflyMeshError";
  }
}

async function request<T>(
  opts: ClientOpts,
  method: string,
  path: string,
  body: unknown,
  responseSchema: z.ZodType<T>,
): Promise<T> {
  const f = opts.fetch ?? fetch;
  const url = opts.baseUrl.replace(/\/+$/, "") + path;
  const res = await f(url, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${opts.token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsedJson: unknown = undefined;
  if (text.length > 0) {
    try {
      parsedJson = JSON.parse(text);
    } catch {
      throw new FireflyMeshError(
        res.status,
        "INVALID_RESPONSE",
        `Non-JSON response from ${url}`,
        text.slice(0, 200),
      );
    }
  }
  if (!res.ok) {
    const errBody = parsedJson as
      | { error?: { code?: string; message?: string; details?: unknown } }
      | undefined;
    throw new FireflyMeshError(
      res.status,
      errBody?.error?.code ?? "HTTP_" + res.status,
      errBody?.error?.message ?? `HTTP ${res.status} from ${url}`,
      errBody?.error?.details,
    );
  }
  const validated = responseSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new FireflyMeshError(
      res.status,
      "RESPONSE_SCHEMA_MISMATCH",
      `Response from ${url} did not match expected schema`,
      validated.error.issues,
    );
  }
  return validated.data;
}

export class FireflyMeshClient {
  constructor(private opts: ClientOpts) {}

  // ---- Task ----
  task = {
    /**
     * Submit a high-level task description; server LLM-decomposes into
     * subtasks and stores them with status='pending_dispatch_approval'.
     * Sender must approve via web UI before child tasks are created.
     */
    dispatch: (input: z.infer<typeof TaskDispatchRequest>) =>
      request(
        this.opts,
        "POST",
        "/api/task/dispatch",
        TaskDispatchRequest.parse(input),
        TaskDispatchResponse,
      ),

    /**
     * Approve the LLM-proposed decomposition (HITL point 1).
     * Optionally edit titles / summaries / assignees before approving.
     */
    approveDispatch: (
      taskId: string,
      input?: z.infer<typeof TaskApproveDispatchRequest>,
    ) =>
      request(
        this.opts,
        "POST",
        `/api/task/${taskId}/approve-dispatch`,
        input ? TaskApproveDispatchRequest.parse(input) : {},
        z.object({
          data: z.object({
            rootTaskId: z.string().uuid(),
            children: z.array(
              z.object({
                id: z.string().uuid(),
                title: z.string(),
                assigneeEmployeeId: z.string().uuid().nullable(),
              }),
            ),
            handoffsSent: z.number().int(),
            handoffsSkipped: z.number().int(),
          }),
        }),
      ),

    /** List tasks visible to the calling employee (auto-filter by org + RBAC). */
    list: (params?: { employeeId?: string; status?: string; cursor?: string }) => {
      const search = new URLSearchParams();
      if (params?.employeeId) search.set("employeeId", params.employeeId);
      if (params?.status) search.set("status", params.status);
      if (params?.cursor) search.set("cursor", params.cursor);
      const qs = search.toString();
      return request(
        this.opts,
        "GET",
        `/api/task/list${qs ? "?" + qs : ""}`,
        undefined,
        TaskListResponse,
      );
    },

    /** Submit assignee work product (creator approval triggers HITL point 2). */
    submit: (taskId: string, input: z.infer<typeof TaskSubmitRequest>) =>
      request(
        this.opts,
        "POST",
        `/api/task/${taskId}/submit`,
        TaskSubmitRequest.parse(input),
        z.object({
          data: z.object({
            taskId: z.string().uuid(),
            status: z.string(),
          }),
        }),
      ),
  };

  // ---- A2A ----
  a2a = {
    /**
     * Send an A2A message. Caller is responsible for ed25519-signing the
     * canonicalized body and passing `signature` + scope-headers.
     * (See packages/skill/src/client/auth.ts for a worked example.)
     */
    send: (input: z.infer<typeof A2ASendRequest>) =>
      request(
        this.opts,
        "POST",
        "/api/a2a/send",
        A2ASendRequest.parse(input),
        A2ASendResponse,
      ),

    inbox: (params?: {
      employeeId?: string;
      tab?: z.infer<typeof InboxTab>;
      cursor?: string;
    }) => {
      const search = new URLSearchParams();
      if (params?.employeeId) search.set("employeeId", params.employeeId);
      if (params?.tab) search.set("tab", params.tab);
      if (params?.cursor) search.set("cursor", params.cursor);
      const qs = search.toString();
      return request(
        this.opts,
        "GET",
        `/api/a2a/inbox${qs ? "?" + qs : ""}`,
        undefined,
        InboxResponse,
      );
    },

    approve: (messageId: string) =>
      request(
        this.opts,
        "POST",
        `/api/a2a/${messageId}/approve`,
        {},
        z.object({ data: z.object({ messageId: z.string().uuid() }) }),
      ),

    reject: (messageId: string, reason?: string) =>
      request(
        this.opts,
        "POST",
        `/api/a2a/${messageId}/reject`,
        { reason },
        z.object({ data: z.object({ messageId: z.string().uuid() }) }),
      ),

    accept: (messageId: string) =>
      request(
        this.opts,
        "POST",
        `/api/a2a/${messageId}/accept`,
        {},
        z.object({ data: z.object({ messageId: z.string().uuid() }) }),
      ),
  };

  // ---- Skill ----
  skill = {
    /**
     * Returns the merged effective skill list for the given employee
     * (Personal > Department > Company). MVP: returns the union;
     * conflict resolution per design §6.5 is M9.
     */
    loaded: (employeeId?: string) => {
      const qs = employeeId ? `?employeeId=${employeeId}` : "";
      return request(
        this.opts,
        "GET",
        `/api/skill/loaded${qs}`,
        undefined,
        SkillLoadedResponse,
      );
    },
  };

  // ---- Knowledge (M7 — MVP returns empty) ----
  kb = {
    search: (input: z.infer<typeof KnowledgeSearchRequest>) =>
      request(
        this.opts,
        "POST",
        "/api/knowledge/search",
        KnowledgeSearchRequest.parse(input),
        KnowledgeSearchResponse,
      ),
  };

  // ---- Audit ----
  audit = {
    list: (params?: {
      action?: string;
      resourceType?: string;
      cursor?: string;
    }) => {
      const search = new URLSearchParams();
      if (params?.action) search.set("action", params.action);
      if (params?.resourceType) search.set("resourceType", params.resourceType);
      if (params?.cursor) search.set("cursor", params.cursor);
      const qs = search.toString();
      return request(
        this.opts,
        "GET",
        `/api/audit/log${qs ? "?" + qs : ""}`,
        undefined,
        AuditListResponse,
      );
    },
  };
}
