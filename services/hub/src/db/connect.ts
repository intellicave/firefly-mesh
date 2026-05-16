import { drizzle } from "drizzle-orm/d1"
import * as schema from "./schema.ts"
import type { Bindings } from "../auth.ts"

/**
 * Centralised Drizzle constructor with full schema binding.
 * New routes (sprint 2026-05-16+) should call this. Older routes that inline
 * `drizzle(c.env.DB, { schema })` are kept for backward compatibility.
 */
export const drizzleD1 = (env: Bindings) => drizzle(env.DB, { schema })

export type DrizzleD1 = ReturnType<typeof drizzleD1>
