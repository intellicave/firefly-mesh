-- firefly-mesh — first-boot Postgres init.
-- Runs once when pgdata volume is first created (postgres entrypoint convention).
-- Drizzle migrations are applied later by the firefly-mesh server on startup.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
