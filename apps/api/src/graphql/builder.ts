import SchemaBuilder from "@pothos/core";

import type { ApiContext } from "../context";

/**
 * The single Pothos builder every GraphQL module registers against. The
 * root Query/Mutation types are declared empty here; each domain module
 * adds its fields via `builder.queryFields` / `builder.mutationFields`,
 * and `schema.ts` imports the modules and builds the executable schema.
 */
export const builder = new SchemaBuilder<{ Context: ApiContext }>({});

builder.queryType({});
builder.mutationType({});
