// Orchestrates parse → chunk → embed → persist for one document.
// Per plan M7-2/3/4 — emits SSE progress on knowledge.indexing.{docId}.
//
// All state changes inside one transaction so a crash mid-pipeline leaves
// indexStatus='failed' rather than partial chunks.

import { eq } from "drizzle-orm";

import { db } from "../db/index.ts";
import {
  knowledgeChunks,
  knowledgeDocuments,
} from "../db/schema/index.ts";
import { logAction } from "../audit/log.ts";
import { bus } from "../events/bus.ts";

import { parseFile, type FileType } from "./parse.ts";
import { chunkMarkdown } from "./chunk.ts";
import {
  DEFAULT_EMBED_MODEL,
  EMBED_DIM,
  embedChunks,
} from "./embed.ts";

export interface IndexResult {
  documentId: string;
  chunkCount: number;
  embedModel: string;
}

export async function indexDocument(opts: {
  documentId: string;
  orgId: string;
  buffer: Buffer;
  fileType: FileType;
  scope: "company" | "department" | "personal";
  departmentId?: string;
  ownerEmployeeId?: string;
  actorEmployeeId: string;
}): Promise<IndexResult> {
  const channel = `knowledge.indexing.${opts.documentId}`;

  await db
    .update(knowledgeDocuments)
    .set({ indexStatus: "indexing", updatedAt: new Date() })
    .where(eq(knowledgeDocuments.id, opts.documentId));
  bus.publish(channel, "knowledge.indexing.started", {
    documentId: opts.documentId,
  });

  try {
    const parsed = await parseFile(opts.buffer, opts.fileType);
    bus.publish(channel, "knowledge.parsed", {
      documentId: opts.documentId,
      chars: parsed.text.length,
    });

    const chunks = chunkMarkdown(parsed.text);
    if (chunks.length === 0) {
      throw new Error("Document yielded zero chunks");
    }

    bus.publish(channel, "knowledge.chunked", {
      documentId: opts.documentId,
      chunkCount: chunks.length,
    });

    const embeddings = await embedChunks(chunks.map((c) => c.content));
    bus.publish(channel, "knowledge.embedded", {
      documentId: opts.documentId,
      dim: EMBED_DIM,
    });

    await db.transaction(async (tx) => {
      // Replace any prior chunks (re-index path)
      await tx
        .delete(knowledgeChunks)
        .where(eq(knowledgeChunks.documentId, opts.documentId));

      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i]!;
        const v = embeddings[i]!;
        await tx.insert(knowledgeChunks).values({
          documentId: opts.documentId,
          orgId: opts.orgId,
          scope: opts.scope,
          departmentId: opts.departmentId,
          ownerEmployeeId: opts.ownerEmployeeId,
          chunkIndex: String(c.index),
          content: c.content,
          embedding: v,
          startOffset: String(c.startOffset),
          endOffset: String(c.endOffset),
          headingPath: c.headingPath,
        });
      }

      await tx
        .update(knowledgeDocuments)
        .set({
          indexStatus: "ready",
          chunkCount: String(chunks.length),
          embedModel: DEFAULT_EMBED_MODEL,
          lastIndexedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(knowledgeDocuments.id, opts.documentId));
    });

    await logAction({
      orgId: opts.orgId,
      actorType: "human",
      actorId: opts.actorEmployeeId,
      action: "knowledge.indexed",
      resourceType: "knowledge_document",
      resourceId: opts.documentId,
      payload: {
        chunkCount: chunks.length,
        embedModel: DEFAULT_EMBED_MODEL,
      },
    });

    bus.publish(channel, "knowledge.indexed", {
      documentId: opts.documentId,
      chunkCount: chunks.length,
    });

    return {
      documentId: opts.documentId,
      chunkCount: chunks.length,
      embedModel: DEFAULT_EMBED_MODEL,
    };
  } catch (err) {
    await db
      .update(knowledgeDocuments)
      .set({ indexStatus: "failed", updatedAt: new Date() })
      .where(eq(knowledgeDocuments.id, opts.documentId));
    bus.publish(channel, "knowledge.failed", {
      documentId: opts.documentId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
