import type { NextConfig } from "next";

const config: NextConfig = {
  // @timetable/shared ships TypeScript source; let Next transpile it.
  transpilePackages: ["@timetable/shared"],
};

export default config;
