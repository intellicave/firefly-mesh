// POST /api/employee/import — multipart CSV import (admin only).
// Headers required: name, email. Optional: title, role.
// Returns full preview with per-row validation status; client confirms
// before final commit (UI step in /onboarding/import-employees).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@firefly-mesh/core/db";
import { employees } from "@firefly-mesh/core/db/schema";
import { logAction } from "@firefly-mesh/core/audit/log";

import { withAuth } from "@/lib/middleware/withAuth";
import { withOrgGuard } from "@/lib/middleware/withOrgGuard";
import { withRBAC } from "@/lib/middleware/withRBAC";
import { isUserSession } from "@/lib/middleware/types";

const RowSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().toLowerCase(),
  title: z.string().max(80).optional(),
  role: z
    .enum(["owner", "admin", "manager", "employee", "auditor"])
    .default("employee"),
});

interface ParsedRow {
  rowNum: number;
  raw: Record<string, string>;
  ok: boolean;
  error?: string;
  parsed?: z.infer<typeof RowSchema>;
}

/**
 * Minimal RFC-4180-ish CSV parser:
 * - Comma-separated
 * - "" quoted fields with "" escape
 * - \r\n or \n line endings
 * - Returns string[][]
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuote = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuote = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuote = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export const POST = withAuth(
  withOrgGuard(
    withRBAC(["owner", "admin"])(async (req: NextRequest, ctx) => {
      if (!isUserSession(ctx.session)) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN" } },
          { status: 403 },
        );
      }

      const contentType = req.headers.get("content-type") ?? "";
      if (!contentType.includes("multipart/form-data")) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "multipart/form-data required",
            },
          },
          { status: 400 },
        );
      }

      const form = await req.formData();
      const fileEntry = form.get("file");
      const confirm = form.get("confirm") === "true";

      if (!(fileEntry instanceof File)) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "form field 'file' is required",
            },
          },
          { status: 400 },
        );
      }

      const text = await fileEntry.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "CSV is empty",
            },
          },
          { status: 400 },
        );
      }

      const header = rows[0]!.map((h) => h.trim().toLowerCase());
      const requiredCols = ["name", "email"];
      for (const col of requiredCols) {
        if (!header.includes(col)) {
          return NextResponse.json(
            {
              error: {
                code: "VALIDATION_ERROR",
                message: `Missing required column: ${col}`,
              },
            },
            { status: 400 },
          );
        }
      }

      const dataRows = rows.slice(1);
      const parsedRows: ParsedRow[] = dataRows.map((cells, idx) => {
        const raw: Record<string, string> = {};
        header.forEach((col, ci) => {
          raw[col] = (cells[ci] ?? "").trim();
        });

        const validation = RowSchema.safeParse(raw);
        if (!validation.success) {
          return {
            rowNum: idx + 2, // +2 because header is row 1, data starts at row 2
            raw,
            ok: false,
            error: validation.error.issues
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; "),
          };
        }
        return { rowNum: idx + 2, raw, ok: true, parsed: validation.data };
      });

      const validRows = parsedRows.filter((r) => r.ok);
      const errorRows = parsedRows.filter((r) => !r.ok);

      // Preview mode (no confirm) — return parsed result, no DB writes
      if (!confirm) {
        return NextResponse.json({
          data: {
            mode: "preview",
            totalRows: parsedRows.length,
            validCount: validRows.length,
            errorCount: errorRows.length,
            rows: parsedRows,
          },
        });
      }

      // Confirm mode — only insert if no errors
      if (errorRows.length > 0) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: `Cannot import: ${errorRows.length} row(s) have errors`,
              details: { errorRows: errorRows.slice(0, 10) },
            },
          },
          { status: 400 },
        );
      }

      const inserted = await db
        .insert(employees)
        .values(
          validRows.map((r) => ({
            orgId: ctx.session.orgId,
            name: r.parsed!.name,
            email: r.parsed!.email,
            title: r.parsed!.title,
            role: r.parsed!.role,
          })),
        )
        .returning({ id: employees.id, name: employees.name });

      await logAction({
        orgId: ctx.session.orgId,
        actorType: "human",
        actorId: ctx.session.userId,
        action: "employee.imported",
        resourceType: "employee",
        payload: { count: inserted.length },
      });

      return NextResponse.json({
        data: {
          mode: "imported",
          imported: inserted,
          count: inserted.length,
        },
      });
    }),
  ),
);
