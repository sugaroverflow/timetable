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

function enumEnv<const T extends readonly string[]>(
  name: string,
  allowed: T,
  fallback: T[number],
): T[number] {
  const raw = process.env[name] ?? fallback;
  if (!allowed.includes(raw)) {
    throw new Error(`[api] ${name} must be one of: ${allowed.join(", ")}`);
  }
  return raw;
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProd = nodeEnv === "production";
const rateLimitBackend = enumEnv(
  "RATE_LIMIT_BACKEND",
  ["memory", "database"] as const,
  isProd ? "database" : "memory",
);

if (isProd) {
  const required = [
    "DATABASE_URL",
    "CLERK_SECRET_KEY",
    "CRON_SECRET",
    "WEB_ORIGIN",
  ] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `[api] Missing required production env vars: ${missing.join(", ")}`,
    );
  }
}

if (rateLimitBackend === "database" && !process.env.DATABASE_URL) {
  throw new Error(
    "[api] RATE_LIMIT_BACKEND=database requires DATABASE_URL so buckets are shared across API instances",
  );
}

if (process.env.SPACES_BUCKET) {
  const requiredStorage = [
    "SPACES_KEY",
    "SPACES_SECRET",
    "SPACES_ENDPOINT",
    "SPACES_BUCKET",
  ] as const;
  const missingStorage = requiredStorage.filter((name) => !process.env[name]);
  if (missingStorage.length > 0) {
    throw new Error(
      `[api] SPACES_BUCKET is set but missing required storage vars: ${missingStorage.join(", ")}`,
    );
  }
}

export const env = {
  port: intEnv("API_PORT", 4000),
  webOrigin: listEnv("WEB_ORIGIN", "http://localhost:3000"),
  nodeEnv,
  isProd,
  trustProxyHops: intEnv("TRUST_PROXY_HOPS", 1),
  rateLimitBackend,
  rateLimitKeyPrefix:
    process.env.RATE_LIMIT_KEY_PREFIX ?? `timetable:${nodeEnv}:api`,
  rateLimitWindowMs: intEnv("RATE_LIMIT_WINDOW_MS", 60_000),
  rateLimitMax: intEnv("RATE_LIMIT_MAX", 300),
  rateLimitCleanupIntervalMs: intEnv("RATE_LIMIT_CLEANUP_INTERVAL_MS", 300_000),
  graphqlMaxDepth: intEnv("GRAPHQL_MAX_DEPTH", 12),
  graphqlMaxCost: intEnv("GRAPHQL_MAX_COST", 500),
  uploadMaxImageBytes: intEnv("UPLOAD_MAX_IMAGE_BYTES", 5 * 1024 * 1024),
  storage: process.env.SPACES_BUCKET
    ? {
        key: process.env.SPACES_KEY!,
        secret: process.env.SPACES_SECRET!,
        endpoint: process.env.SPACES_ENDPOINT!,
        bucket: process.env.SPACES_BUCKET!,
        region: process.env.SPACES_REGION ?? "us-east-1",
        publicBaseUrl: process.env.SPACES_PUBLIC_BASE_URL ?? null,
        keyPrefix: process.env.SPACES_KEY_PREFIX ?? null,
        forcePathStyle: process.env.SPACES_FORCE_PATH_STYLE === "true",
      }
    : null,
};
