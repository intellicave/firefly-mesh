// agentskills.io-compatible manifest + /api/skill/* wire schemas.

import { z } from "zod";

export const SkillScope = z.enum(["company", "department", "personal"]);
export type SkillScope = z.infer<typeof SkillScope>;

export const SkillManifest = z.object({
  $schema: z.string().optional(),
  name: z.string().min(1).max(120),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/),
  description: z.string().max(1000).optional(),
  author: z.string().max(120).optional(),
  homepage: z.string().url().optional(),
  license: z.string().max(40).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  capabilities: z
    .array(z.string().max(80))
    .max(40)
    .optional(),
  inputs: z.record(z.string(), z.unknown()).optional(),
  outputs: z.record(z.string(), z.unknown()).optional(),
  files: z
    .array(
      z.object({
        path: z.string(),
        sha256: z.string().optional(),
      }),
    )
    .optional(),
});
export type SkillManifest = z.infer<typeof SkillManifest>;

export const LoadedSkill = z.object({
  id: z.string().uuid(),
  manifestId: z.string(),
  version: z.string(),
  scope: SkillScope,
  manifest: SkillManifest,
  conflictResolved: z
    .object({
      winnerScope: SkillScope,
      hiddenSkillIds: z.array(z.string().uuid()),
    })
    .optional(),
});
export type LoadedSkill = z.infer<typeof LoadedSkill>;

export const SkillLoadedResponse = z.object({
  data: z.object({
    skills: z.array(LoadedSkill),
    cacheKey: z.string(),
  }),
});
export type SkillLoadedResponse = z.infer<typeof SkillLoadedResponse>;
