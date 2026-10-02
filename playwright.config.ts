import { defineConfig, devices } from "@playwright/test";

// Default to 3100, not 3000: the suite always starts its own web server
// (reuse is disabled below), so on 3000 it would fail "port is already used"
// for anyone running the documented dev stack (`npm run dev`, web on :3000).
// Nothing ties the tests to 3000 — E2E_TEST_MODE strips Clerk and the API
// URL is pinned separately. PLAYWRIGHT_PORT overrides; an unset or
// malformed value falls back to 3100.
const envPort = Number(process.env.PLAYWRIGHT_PORT);
const port = Number.isInteger(envPort) && envPort > 0 ? envPort : 3100;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // --port must be threaded through: the workspace's dev script pins
    // `next dev -p 3000`, so without this PLAYWRIGHT_PORT moved only the
    // baseURL and the suite waited on a port nothing was ever served on.
    command: `npm run dev --workspace @timetable/web -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    // Never reuse. Reuse trusts whatever answers on the port to BE this app,
    // and a dev machine running any other service on 3000 (a second Next
    // project, a CRM, anything) silently hijacks the whole suite: Playwright
    // skips starting the web server and asserts against the stranger's UI,
    // which fails as unreadable "element not visible" errors far from the
    // cause. Failing loudly with "port is already used" is the better trade —
    // set PLAYWRIGHT_PORT to a free port to run alongside whatever holds 3000.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      E2E_TEST_MODE: "1",
      NEXT_PUBLIC_API_URL:
        process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000",
      NEXT_PUBLIC_GRAPHQL_URL:
        process.env.NEXT_PUBLIC_GRAPHQL_URL ?? "http://127.0.0.1:4000/graphql",
      NEXT_PUBLIC_CANONICAL_HOSTS:
        process.env.NEXT_PUBLIC_CANONICAL_HOSTS ?? "localhost,127.0.0.1",
    },
  },
});
