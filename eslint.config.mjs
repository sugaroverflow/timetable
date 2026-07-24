import eslint from "@eslint/js";
import sonarjs from "eslint-plugin-sonarjs";
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
  // Complexity budgets (2026-07-22 simplify audit). New code stays under
  // them; pre-existing offenders carry file-level disables that form the
  // decomposition burn-down list — remove the disable when you refactor.
  {
    plugins: { sonarjs },
    rules: {
      "sonarjs/cognitive-complexity": ["error", 15],
      complexity: ["error", 12],
      "max-depth": ["error", 4],
      "max-lines-per-function": [
        "error",
        { max: 150, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  // Long describe blocks in tests are legitimate — a spec suite reads as one
  // sequential story, so the per-function line budget doesn't apply there.
  {
    files: ["**/*.test.ts"],
    rules: { "max-lines-per-function": "off" },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
);
