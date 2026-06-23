import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Load the monorepo-root .env (packages/db/src -> repo root).
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

const sql = postgres(url, {
  max: 1,
  ssl: process.env.DATABASE_SSL === "require" ? "require" : undefined,
});

await migrate(drizzle(sql), { migrationsFolder });
await sql.end();

console.log("Migrations applied from", migrationsFolder);
