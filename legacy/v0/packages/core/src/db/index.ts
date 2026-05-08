import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema/index.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is required. Set it in firefly-mesh/.env.local",
  );
}

const pool = new Pool({ connectionString, max: 10 });

export const db = drizzle(pool, { schema, casing: "snake_case" });

export type Database = typeof db;
export { schema };
