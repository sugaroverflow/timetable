import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Lint for the node workspaces (apps/api, packages/*) plus tests and
 * scripts. The web app has its own Next-specific config in
 * apps/web/eslint.config.mjs and is ignored here.
 */
export default tseslint.config(
  {
    ignores: [
      "apps/web/**",
      "**/node_modules/**",
      "**/.next/**",
      "packages/db/drizzle/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
);
