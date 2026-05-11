#!/usr/bin/env node
/**
 * Install the audit_log append-only triggers.
 *
 * Why this lives outside migrations/: `wrangler d1 migrations apply` splits
 * the SQL file on `;`, so any trigger with a BEGIN/END body gets cut into
 * two invalid statements ("incomplete input" SQLite error). The
 * `wrangler d1 execute --file` path POSTs the file contents as a single
 * statement and handles BEGIN/END correctly.
 *
 * Usage:
 *   node scripts/install-audit-triggers.mjs --local    # local miniflare D1
 *   node scripts/install-audit-triggers.mjs --remote   # production D1
 */

import { spawnSync } from "node:child_process"
import { writeFileSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

const target = process.argv[2]
if (target !== "--local" && target !== "--remote") {
  console.error("usage: install-audit-triggers.mjs --local | --remote")
  process.exit(1)
}

const triggers = [
  {
    name: "audit_log_no_update",
    sql: `CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END`,
  },
  {
    name: "audit_log_no_delete",
    sql: `CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END`,
  },
]

const isWin = process.platform === "win32"
const pnpm = isWin ? "pnpm.cmd" : "pnpm"
const tmp = mkdtempSync(join(tmpdir(), "audit-triggers-"))

try {
  for (const t of triggers) {
    const sqlFile = join(tmp, `${t.name}.sql`)
    writeFileSync(sqlFile, t.sql + "\n", "utf8")
    console.log(`[install] ${t.name} (${target.slice(2)})`)
    const r = spawnSync(
      pnpm,
      [
        "exec",
        "wrangler",
        "d1",
        "execute",
        "firefly-mesh-hub-db",
        target,
        "--file",
        sqlFile,
        "--yes",
      ],
      { stdio: "inherit", shell: isWin },
    )
    if (r.status !== 0) {
      console.error(`[install] FAILED on ${t.name} (exit ${r.status})`)
      process.exit(r.status ?? 1)
    }
  }
  console.log("[install] all triggers installed")
} finally {
  try { rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
}
