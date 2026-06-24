import path from "path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // @timetable/shared ships TypeScript source; let Next transpile it.
  transpilePackages: ["@timetable/shared"],
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default config;
