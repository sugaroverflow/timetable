/**
 * Print the API's GraphQL schema as sorted SDL — a stable snapshot for
 * refactor verification: capture before and after, diff must be empty.
 *
 * Usage (from the repo root):
 *   node --import tsx scripts/print-schema.mjs > /tmp/schema.txt
 */
import { lexicographicSortSchema, printSchema } from "graphql";

const { schema } = await import(
  new URL("../apps/api/src/graphql/schema.ts", import.meta.url).href
);

process.stdout.write(`${printSchema(lexicographicSortSchema(schema))}\n`);
