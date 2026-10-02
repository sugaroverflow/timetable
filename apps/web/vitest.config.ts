import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  // Vite 8 transforms with Oxc, not esbuild, so the JSX runtime is set
  // here — tsconfig pins `jsx: preserve` for Next to compile, which leaves
  // the transformer with JSX it won't touch. Component tests
  // (QueueControls.test.tsx) need it; a jsdom test opts in per file with an
  // `@vitest-environment jsdom` docblock, so lib tests stay on node.
  oxc: { jsx: { runtime: "automatic" } },
});
