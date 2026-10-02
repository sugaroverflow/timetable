import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Force a single graphql module instance. Vite's ESM/CJS interop can
      // load two copies of graphql-16 (one for transformed app code, one
      // required by graphql-yoga), and cross-copy `instanceof GraphQLError`
      // fails — Yoga then masks resolver-thrown GraphQLErrors to
      // "Unexpected error." in tests only, so error-message assertions lie.
      graphql: path.resolve(__dirname, "../../node_modules/graphql/index.js"),
    },
  },
});
