import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// pg.Pool() with no arguments reads DATABASE_URL automatically, and also
// falls back to individual PG* env vars (PGHOST, PGPORT, PGUSER, PGPASSWORD,
// PGDATABASE) that Replit injects into the Cloud Run container environment.
// We do NOT throw eagerly here — pid1 (Replit's routing proxy) creates the
// api-server subprocess with only the vars listed in artifact.toml's
// [services.production.run.env], so DATABASE_URL may not be present at module
// load time even though it IS in the outer container env. Failing at module
// load crashes the process before listen() is called, preventing the startup
// probe from ever getting a 200. By deferring to pg's own env-var handling,
// the server starts cleanly and the health check passes. Any connection error
// surfaces at query time on the first database operation, not at startup.
export const pool = new Pool();
export const db = drizzle(pool, { schema });

export * from "./schema";
