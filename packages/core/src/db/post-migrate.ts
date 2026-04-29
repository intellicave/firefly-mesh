#!/usr/bin/env -S tsx
// Post-migration: append-only RULE on audit_log (M1-4 acceptance).
//
// drizzle-kit doesn't manage raw SQL outside its own migrations, so RULE
// creation runs as a separate idempotent post-step. Run after every
// `drizzle-kit migrate` via `pnpm migrate` script.

import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({ connectionString: databaseUrl });

const STATEMENTS = [
  // audit_log append-only enforcement (rules.md R1, plan.md M1-4)
  `CREATE OR REPLACE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING`,
  `CREATE OR REPLACE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING`,
];

async function main() {
  console.log("Post-migrate: applying DB-level RULEs...");
  for (const sql of STATEMENTS) {
    await pool.query(sql);
    console.log("  ✓", sql.replace(/\s+/g, " ").slice(0, 80));
  }
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error("Post-migrate FAILED:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
