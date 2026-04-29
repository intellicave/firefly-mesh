// /api/audit/* wire schemas (read-only — audit log is RULE-protected).

import { z } from "zod";

export const AuditActorType = z.enum(["human", "agent", "system"]);
export type AuditActorType = z.infer<typeof AuditActorType>;

export const AuditEntry = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  actorType: AuditActorType,
  actorId: z.string().uuid().nullable(),
  action: z.string(),
  resourceType: z.string().nullable(),
  resourceId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

export const AuditListResponse = z.object({
  data: z.object({
    entries: z.array(AuditEntry),
    nextCursor: z.string().nullable().optional(),
  }),
});
export type AuditListResponse = z.infer<typeof AuditListResponse>;
