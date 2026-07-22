import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL ?? "";

if (!connectionString) {
  // postgres.js connects lazily, so we don't throw here (keeps Next builds and
  // tooling that imports the schema working without a live DB). Queries will
  // fail with a clear error if DATABASE_URL is genuinely missing at runtime.
  console.warn(
    "[@timetable/db] DATABASE_URL is not set; database queries will fail.",
  );
}

const ssl = process.env.DATABASE_SSL === "require" ? "require" : undefined;

/**
 * Reuse one underlying client across hot reloads (Next dev / tsx watch) to
 * avoid exhausting the connection pool.
 */
const globalForDb = globalThis as unknown as {
  __timetablePg?: ReturnType<typeof postgres>;
};

const queryClient =
  globalForDb.__timetablePg ?? postgres(connectionString, { ssl, max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__timetablePg = queryClient;
}

export const db = drizzle(queryClient, { schema, casing: "snake_case" });
export type DB = typeof db;

export { schema };
