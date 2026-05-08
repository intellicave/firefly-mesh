// Wire-format zod schemas for /api/task/*.
// Mirrored from packages/web routes — kept independent so external SDK
// users do not need to depend on @firefly-mesh/core (server-only).

import { z } from "zod";

export const TaskStatus = z.enum([
  "draft",
  "pending_dispatch_approval",
  "assigned",
  "in_progress",
  "submitted",
  "approved",
  "rejected",
  "completed",
]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const SubTask = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(500),
  targetDept: z.string().nullable().optional(),
  targetRole: z
    .enum(["owner", "admin", "manager", "employee"])
    .nullable()
    .optional(),
  estimatedHours: z.number().min(0.25).max(160).nullable().optional(),
  deadlineOffsetDays: z.number().int().min(1).max(60).nullable().optional(),
});
export type SubTask = z.infer<typeof SubTask>;

export const TaskDispatchRequest = z.object({
  description: z.string().min(10).max(2000),
  deadline: z.string().datetime().optional(),
  priorityHint: z.enum(["low", "normal", "high"]).optional(),
});
export type TaskDispatchRequest = z.infer<typeof TaskDispatchRequest>;

export const TaskDispatchResponse = z.object({
  data: z.object({
    rootTaskId: z.string().uuid(),
    pendingApprovalId: z.string().uuid(),
    decomposition: z.array(SubTask),
  }),
});
export type TaskDispatchResponse = z.infer<typeof TaskDispatchResponse>;

export const TaskApproveDispatchRequest = z.object({
  adjustments: z
    .array(
      z.object({
        subtaskIndex: z.number().int().min(0),
        title: z.string().max(120).optional(),
        summary: z.string().max(500).optional(),
        targetEmployeeId: z.string().uuid().optional(),
        skip: z.boolean().optional(),
      }),
    )
    .optional(),
});
export type TaskApproveDispatchRequest = z.infer<
  typeof TaskApproveDispatchRequest
>;

export const TaskListItem = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: TaskStatus,
  parentId: z.string().uuid().nullable(),
  rootId: z.string().uuid().nullable(),
  creatorEmployeeId: z.string().uuid(),
  assigneeEmployeeId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TaskListItem = z.infer<typeof TaskListItem>;

export const TaskListResponse = z.object({
  data: z.object({
    tasks: z.array(TaskListItem),
    nextCursor: z.string().nullable().optional(),
  }),
});
export type TaskListResponse = z.infer<typeof TaskListResponse>;

export const TaskSubmitRequest = z.object({
  output: z.record(z.string(), z.unknown()),
  summary: z.string().max(500).optional(),
});
export type TaskSubmitRequest = z.infer<typeof TaskSubmitRequest>;
