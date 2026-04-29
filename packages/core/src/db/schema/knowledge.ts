import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { departments, employees, organizations } from "./org.ts";

// Three-tier scope KB (Company / Department / Personal). Project scope is V0.2.
// Embeddings via Vercel AI Gateway — voyage-3-large default (dim 2048).
// Markdown-aware semantic chunking.
export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),

    scope: text("scope", { enum: ["company", "department", "personal"] })
      .notNull(),
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "cascade",
    }),
    ownerEmployeeId: uuid("owner_employee_id").references(() => employees.id, {
      onDelete: "cascade",
    }),

    title: text("title").notNull(),
    description: text("description"),
    tags: jsonb("tags").$type<string[]>().default([]),

    // Source file
    fileType: text("file_type", {
      enum: ["pdf", "docx", "md", "txt", "html"],
    }).notNull(),
    fileUrl: text("file_url"),
    fileSize: text("file_size"),

    indexStatus: text("index_status", {
      enum: ["pending", "indexing", "ready", "failed"],
    })
      .default("pending")
      .notNull(),
    chunkCount: text("chunk_count").default("0"),
    embedModel: text("embed_model"),
    lastIndexedAt: timestamp("last_indexed_at"),

    createdBy: uuid("created_by")
      .references(() => employees.id)
      .notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    scopeCheck: check(
      "kb_scope_check",
      sql`(${table.scope} = 'company' AND ${table.departmentId} IS NULL AND ${table.ownerEmployeeId} IS NULL)
        OR (${table.scope} = 'department' AND ${table.departmentId} IS NOT NULL)
        OR (${table.scope} = 'personal' AND ${table.ownerEmployeeId} IS NOT NULL)`,
    ),
  }),
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" })
      .notNull(),
    orgId: uuid("org_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),

    // Denormalized scope (avoids JOIN in RAG hot path)
    scope: text("scope").notNull(),
    departmentId: uuid("department_id"),
    ownerEmployeeId: uuid("owner_employee_id"),

    chunkIndex: text("chunk_index").notNull(),
    content: text("content").notNull(),

    // pgvector — voyage-3-large dimension is 2048
    embedding: vector("embedding", { dimensions: 2048 }),

    // Markdown-aware semantic chunking metadata
    startOffset: text("start_offset"),
    endOffset: text("end_offset"),
    headingPath: jsonb("heading_path").$type<string[]>(),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    embeddingIdx: index("knowledge_chunks_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  }),
);
