import next from "eslint-config-next";

// eslint-config-next v16 ships a complete flat-config array (rules + ignores).
export default [
  ...next,
  {
    rules: {
      // App Router loads Google Fonts via <link> in app/layout.tsx; the
      // pages-router-era rule doesn't apply here.
      "@next/next/no-page-custom-font": "off",
    },
  },
];
