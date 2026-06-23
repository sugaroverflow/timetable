function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`[api] ${name} must be a positive integer`);
  }
  return parsed;
}

function listEnv(name: string, fallback: string): string[] {
  return (process.env[name] ?? fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProd = nodeEnv === "production";

if (isProd) {
  const required = ["DATABASE_URL", "CLERK_SECRET_KEY", "WEB_ORIGIN"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `[api] Missing required production env vars: ${missing.join(", ")}`,
    );
  }
}

export const env = {
  port: intEnv("API_PORT", 4000),
  webOrigin: listEnv("WEB_ORIGIN", "http://localhost:3000"),
  nodeEnv,
  isProd,
  rateLimitWindowMs: intEnv("RATE_LIMIT_WINDOW_MS", 60_000),
  rateLimitMax: intEnv("RATE_LIMIT_MAX", 300),
  graphqlMaxDepth: intEnv("GRAPHQL_MAX_DEPTH", 12),
};
