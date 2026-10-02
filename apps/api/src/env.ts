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
    "SPACES_REGION",
  ] as const;
  const missingStorage = requiredStorage.filter((name) => !process.env[name]);
  if (missingStorage.length > 0) {
    const msg = `[api] SPACES_BUCKET is set but missing required storage vars: ${missingStorage.join(", ")}`;
    if (isProd) {
      throw new Error(msg);
    } else {
      console.warn(`${msg} — uploads will return 503`);
    }
  }
}

export const env = {
  port: intEnv("API_PORT", 4000),
  webOrigin: listEnv("WEB_ORIGIN", "http://localhost:3000"),
  nodeEnv,
  isProd,
  /**
   * Map Clerk test users (externalId = dev_sample_*) to seeded fixture users
   * on sign-in. On by default outside production builds; hosted dev runs a
   * production build, so it opts in explicitly via DEV_SEED_USER_MAPPING.
   * Never set this in the production app spec.
   */
  devSeedUserMapping: process.env.DEV_SEED_USER_MAPPING === "true" || !isProd,
  /**
   * How many proxy hops in front of Express to trust. Express counts from the
   * RIGHT of X-Forwarded-For, so this must match the real chain exactly.
   *
   * MEASURED on hosted dev, 2026-08-21 (docs/OPERATIONS.md R1):
   *   X-Forwarded-For: <real client>, 172.70.46.137
   * DigitalOcean App Platform is itself fronted by Cloudflare — every
   * *.ondigitalocean.app response carries a CF-RAY header — so the chain is
   * client → Cloudflare → DigitalOcean → here. At hops=1 Express resolved
   * req.ip to the CLOUDFLARE EDGE address, which rotates per request across
   * Cloudflare's fleet; the rate limiter therefore scattered every caller
   * across a pool of buckets and limited nobody. The hosted specs set 2.
   *
   * Counting from the right is also what makes this spoof-resistant: a client
   * who injects their own X-Forwarded-For only pushes entries LEFT, while
   * Cloudflare appends the true client IP to the right of them.
   *
   * The default stays 1 (correct for a plain single-proxy deployment); the
   * app specs override it for the measured DigitalOcean topology.
   */
  trustProxyHops: intEnv("TRUST_PROXY_HOPS", 1),
  /**
   * How long /health waits on its `select 1` before calling the database
   * down. Bounded so a hung Postgres can't stall DigitalOcean's probe.
   */
  healthDbTimeoutMs: intEnv("HEALTH_DB_TIMEOUT_MS", 2_000),
  /**
   * Make /health report the X-Forwarded-For chain it actually receives, so
   * TRUST_PROXY_HOPS can be set from measurement instead of guesswork
   * (ops R1 — today it resolves to a rotating DigitalOcean edge address and
   * scatters every caller across a pool of rate-limit buckets).
   *
   * Opt-in by env var rather than by NODE_ENV, for the same reason
   * devSeedUserMapping is: hosted dev runs a production build, so an
   * isProd check would switch this off exactly where it is needed.
   * Never set this in the production app spec — it exposes proxy topology.
   */
  debugForwarding: process.env.DEBUG_FORWARDING === "true",
  rateLimitBackend,
  rateLimitKeyPrefix:
    process.env.RATE_LIMIT_KEY_PREFIX ?? `timetable:${nodeEnv}:api`,
  rateLimitWindowMs: intEnv("RATE_LIMIT_WINDOW_MS", 60_000),
  rateLimitMax: intEnv("RATE_LIMIT_MAX", 300),
  rateLimitCleanupIntervalMs: intEnv("RATE_LIMIT_CLEANUP_INTERVAL_MS", 300_000),
  /** Shared secret for cron-triggered jobs; required in production
   * (checked above), optional in dev where the routes 503 without it.
   * A getter, not a snapshot: the integration tests set and unset it per
   * test, and re-reading costs nothing. */
  get cronSecret(): string | null {
    return process.env.CRON_SECRET ?? null;
  },
  graphqlMaxDepth: intEnv("GRAPHQL_MAX_DEPTH", 12),
  graphqlMaxCost: intEnv("GRAPHQL_MAX_COST", 500),
  uploadMaxImageBytes: intEnv("UPLOAD_MAX_IMAGE_BYTES", 5 * 1024 * 1024),
  /**
   * Emails (lowercased) whose accounts get the global sysadmin dashboard
   * (/admin): every forum, activity counts, owner contact, forum deletion.
   * Unset in production = nobody. Outside production it defaults to the
   * seeded dev admin so the dashboard is QA-able with zero config.
   */
  sysadminEmails: (
    process.env.SYSADMIN_EMAILS ??
    (isProd ? "" : "admin-edwin+clerk_test@example.com")
  )
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
};
