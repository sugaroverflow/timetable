import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TypeScript source; let Next transpile them.
  transpilePackages: ["@timetable/db", "@timetable/shared", "@timetable/core"],
  // db/core import the postgres driver; keep it external to the server bundle.
  serverExternalPackages: ["postgres"],
};

export default config;
