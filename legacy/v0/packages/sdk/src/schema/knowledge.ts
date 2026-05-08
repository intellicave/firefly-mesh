// /api/knowledge/* wire schemas. MVP returns empty arrays for KB search
// (KB pipeline is M7); schema is pre-defined so skill/mcp clients
// don't need to change when M7 ships.

import { z } from "zod";

export const KnowledgeScope = z.enum([
  "company",
  "department",
  "personal",
  "all",
]);
export type KnowledgeScope = z.infer<typeof KnowledgeScope>;

export const KnowledgeSearchRequest = z.object({
  query: z.string().min(1).max(2000),
  scope: KnowledgeScope.optional(),
  departmentId: z.string().uuid().optional(),
  topK: z.number().int().min(1).max(50).optional(),
});
export type KnowledgeSearchRequest = z.infer<typeof KnowledgeSearchRequest>;

export const KnowledgeChunk = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  text: z.string(),
  scope: KnowledgeScope,
  score: z.number(),
  source: z
    .object({
      title: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
});
export type KnowledgeChunk = z.infer<typeof KnowledgeChunk>;

export const KnowledgeSearchResponse = z.object({
  data: z.object({
    chunks: z.array(KnowledgeChunk),
  }),
});
export type KnowledgeSearchResponse = z.infer<typeof KnowledgeSearchResponse>;
