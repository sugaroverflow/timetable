/**
 * Content-Security-Policy (audit follow-up, Ed's "let's get it done",
 * 2026-08-17). Minted per request in proxy.ts with a fresh nonce; the
 * strict-dynamic pattern (Google's "strict CSP") allows a script only
 * when it carries the nonce or was loaded BY a nonce'd script — Clerk's
 * dynamically-injected bundles ride on that without us enumerating its
 * CDNs. Older browsers ignore strict-dynamic and fall back to the
 * https:/unsafe-inline allowances, which modern browsers in turn ignore
 * when strict-dynamic is present.
 */

import { env } from "@/env";

/** The Clerk frontend-API origin is encoded in the publishable key
 * (pk_test_/pk_live_ + base64("<domain>$")) — decode it rather than
 * hardcoding a domain per environment. */
export function clerkFrontendOrigin(): string | null {
  const key = env.clerkPublishableKey;
  const encoded = key.replace(/^pk_(test|live)_/, "");
  if (!encoded || encoded === key) return null;
  try {
    const domain = atob(encoded).replace(/\$$/, "");
    return domain ? `https://${domain}` : null;
  } catch {
    return null;
  }
}

/** 128-bit random nonce, base64 — new for every request. */
export function mintNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function buildCsp(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  const clerk = clerkFrontendOrigin();
  const api = env.apiUrl;

  const script = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // Pre-strict-dynamic browser fallbacks (modern browsers ignore them).
    "https:",
    "'unsafe-inline'",
    // React fast-refresh evals in dev builds only.
    dev ? "'unsafe-eval'" : null,
  ].filter(Boolean);

  const connect = [
    "'self'",
    api,
    clerk,
    // Clerk's usage telemetry endpoint.
    "https://clerk-telemetry.com",
    // Image uploads PUT straight from the browser to the presigned Spaces
    // URL (ImageUploadField) — the wildcard covers path-style, bucket-
    // subdomain, and CDN hosts in every region/environment. Broke on prod
    // the day CSP shipped (Ed, 2026-08-18): a blocked PUT surfaces as the
    // misleading "bucket CORS" upload error.
    "https://*.digitaloceanspaces.com",
    // Next dev overlay / fast-refresh websocket.
    dev ? "ws:" : null,
  ].filter(Boolean);

  return [
    "default-src 'self'",
    `script-src ${script.join(" ")}`,
    // Inline style ATTRIBUTES are idiomatic throughout the app (and in
    // Clerk's widgets), so styles stay unsafe-inline — script-src is the
    // boundary that matters. The forum-theme <style> tag rides on this
    // too, with its values re-validated at the sink (timetableSettings).
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    // Covers/avatars are member-supplied absolute URLs (https-validated at
    // write time), plus Spaces uploads and Clerk profile images.
    `img-src 'self' blob: data: https:${dev ? " http:" : ""}`,
    `connect-src ${connect.join(" ")}`,
    // Clerk's bot-protection widget (Cloudflare Turnstile) frames itself.
    "frame-src 'self' https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Belt to X-Frame-Options' braces (next.config.ts).
    "frame-ancestors 'none'",
  ].join("; ");
}
