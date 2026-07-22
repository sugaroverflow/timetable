import next from "eslint-config-next";
import sonarjs from "eslint-plugin-sonarjs";

// eslint-config-next v16 ships a complete flat-config array (rules + ignores).
const config = [
  ...next,
  {
    rules: {
      // App Router loads Google Fonts via <link> in app/layout.tsx; the
      // pages-router-era rule doesn't apply here.
      "@next/next/no-page-custom-font": "off",
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
  // Architecture rules from the audit, enforced mechanically:
  // web talks to the API only through the transport wrappers, and
  // NEXT_PUBLIC_* is read only in env.ts (proxy.ts is infra and exempt;
  // ImageUploadField PUTs straight to the storage bucket, not the API).
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/env.ts",
      "src/lib/transport.ts",
      "src/components/ImageUploadField.tsx",
      "src/proxy.ts",
    ],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "Use gqlFetch/clientGql/apiFetch/clientApi (lib/transport.ts) instead of hand-rolled fetch.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            'MemberExpression[object.object.name="process"][object.property.name="env"][property.name=/^NEXT_PUBLIC_/]',
          message:
            "Read NEXT_PUBLIC_* through @/env so URL fallbacks live in one place.",
        },
      ],
    },
  },
];

export default config;
