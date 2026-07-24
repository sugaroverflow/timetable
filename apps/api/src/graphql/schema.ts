/**
 * Assembly point for the GraphQL schema. Each domain module registers its
 * object types and root fields on the shared builder (`builder.ts`) via
 * Pothos' additive `queryFields`/`mutationFields` pattern; the side-effect
 * imports below pull them in — in a deterministic order — and the executable
 * schema is built once here.
 *
 * Shared pieces live in `guards.ts` (auth/loader guards, error helpers,
 * argument parsers) and `types.ts` (object types used by several domains).
 *
 * Verify any restructuring with `node --import tsx scripts/print-schema.mjs`
 * — the sorted SDL must not change.
 */
import { builder } from "./builder";

import "./types";
import "./topics";
import "./comments";
import "./members";
import "./timetables";
import "./activity";
import "./slots";
import "./dashboard";

export const schema = builder.toSchema();
