import { createClerkClient, verifyToken } from "@clerk/backend";
import { eq } from "drizzle-orm";

import { claimInvitesForUser } from "@timetable/core";
import { db, users } from "@timetable/db";

import { env } from "../env";
import { parseCookies } from "../http/cookies";

export type SessionUser = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  bio: string | null;
};

const secretKey = process.env.CLERK_SECRET_KEY ?? "";

const clerkClient = createClerkClient({ secretKey });

/** Extract a Clerk session JWT from the Authorization header or __session cookie. */
function extractToken(
  authHeader?: string | null,
  cookieHeader?: string | null,
): string | null {
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }
  const cookies = parseCookies(cookieHeader);
  return cookies["__session"] ?? null;
}

async function loadLocalUser(id: string): Promise<SessionUser | null> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      bio: users.bio,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return user ?? null;
}

/**
 * Verify a Clerk session token and return the local user, creating it on first
 * sign-in (mirroring Clerk profile fields) and claiming any pending invites.
 */
export async function getUserFromRequest(
  authHeader?: string | null,
  cookieHeader?: string | null,
): Promise<SessionUser | null> {
  if (!secretKey) return null;
  const token = extractToken(authHeader, cookieHeader);
  if (!token) return null;

  let clerkUserId: string;
  try {
    const claims = await verifyToken(token, { secretKey });
    clerkUserId = claims.sub;
  } catch {
    return null;
  }
  if (!clerkUserId) return null;

  const existing = await loadLocalUser(clerkUserId);
  if (existing) return existing;

  // First sign-in: mirror the Clerk profile into a local user row. Dev seed
  // users set Clerk externalId to the deterministic local fixture user id.
  let email: string | null = null;
  let name: string | null = null;
  let image: string | null = null;
  let externalId: string | null = null;
  try {
    const cu = await clerkClient.users.getUser(clerkUserId);
    externalId = cu.externalId ?? null;
    email =
      cu.primaryEmailAddress?.emailAddress ??
      cu.emailAddresses[0]?.emailAddress ??
      null;
    name =
      [cu.firstName, cu.lastName].filter(Boolean).join(" ") ||
      cu.username ||
      null;
    image = cu.imageUrl ?? null;
  } catch {
    // Fall back to a bare row if the Clerk lookup fails.
  }

  if (externalId && env.devSeedUserMapping) {
    const externalUser = await loadLocalUser(externalId);
    if (externalUser) {
      if (email) await claimInvitesForUser(externalUser.id, email);
      return externalUser;
    }
  }

  await db
    .insert(users)
    .values({ id: clerkUserId, email, name, image })
    .onConflictDoNothing();

  if (email) {
    await claimInvitesForUser(clerkUserId, email);
  }

  return loadLocalUser(clerkUserId);
}

/**
 * Find the Clerk account for an email, or create one silently (Clerk's
 * createUser sends no email — the invite email is ours, sent explicitly
 * later once the admin has populated the account; product feedback round 2).
 */
export async function getOrCreateClerkUser(
  email: string,
  name: string | null,
): Promise<{ id: string; created: boolean }> {
  const normalized = email.trim().toLowerCase();
  const existing = await clerkClient.users.getUserList({
    emailAddress: [normalized],
  });
  const found = existing.data[0];
  if (found) return { id: found.id, created: false };

  const [firstName, ...rest] = (name ?? "").trim().split(/\s+/);
  const created = await clerkClient.users.createUser({
    emailAddress: [normalized],
    // The Clerk instance requires a username (createUser fails with
    // form_data_missing without one — the dev seed script always sent one).
    // Sign-in is by email OTP, so this is cosmetic; random suffix for
    // uniqueness.
    username: usernameFor(normalized, name),
    ...(firstName ? { firstName } : {}),
    ...(rest.length > 0 ? { lastName: rest.join(" ") } : {}),
    skipPasswordRequirement: true,
    skipLegalChecks: true,
  });
  return { id: created.id, created: true };
}

function usernameFor(email: string, name: string | null): string {
  const base =
    (name ?? email.split("@")[0] ?? "member")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "member";
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}
