import { createClerkClient, verifyToken } from "@clerk/backend";
import { eq } from "drizzle-orm";

import { claimInvitesForUser } from "@timetable/core";
import { db, users } from "@timetable/db";
import { normalizeEmail } from "@timetable/shared";

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

/** Verify the session JWT and return the Clerk user id, or null. */
async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const claims = await verifyToken(token, { secretKey });
    return claims.sub || null;
  } catch {
    return null;
  }
}

type ClerkProfile = {
  email: string | null;
  name: string | null;
  image: string | null;
  externalId: string | null;
};

/** Mirror of the Clerk profile fields we copy into the local user row.
 * Falls back to an all-null profile (a bare row) if the lookup fails. */
async function fetchClerkProfile(clerkUserId: string): Promise<ClerkProfile> {
  try {
    const cu = await clerkClient.users.getUser(clerkUserId);
    return {
      externalId: cu.externalId ?? null,
      email:
        cu.primaryEmailAddress?.emailAddress ??
        cu.emailAddresses[0]?.emailAddress ??
        null,
      name:
        [cu.firstName, cu.lastName].filter(Boolean).join(" ") ||
        cu.username ||
        null,
      image: cu.imageUrl ?? null,
    };
  } catch {
    return { email: null, name: null, image: null, externalId: null };
  }
}

/** Dev seed users set Clerk externalId to the deterministic local fixture
 * user id — sign-ins map onto that row (claiming invites) instead of
 * creating a new one. */
async function resolveSeedMappedUser(
  externalId: string,
  email: string | null,
): Promise<SessionUser | null> {
  const externalUser = await loadLocalUser(externalId);
  if (!externalUser) return null;
  if (email) await claimInvitesForUser(externalUser.id, email);
  return externalUser;
}

/** First sign-in: create the local row (an existing row wins the race) and
 * claim any invites pending for the profile email. */
async function createUserFromClerkProfile(
  clerkUserId: string,
  profile: ClerkProfile,
): Promise<SessionUser | null> {
  await db
    .insert(users)
    .values({
      id: clerkUserId,
      email: profile.email,
      name: profile.name,
      image: profile.image,
    })
    .onConflictDoNothing();

  if (profile.email) {
    await claimInvitesForUser(clerkUserId, profile.email);
  }

  return loadLocalUser(clerkUserId);
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

  const clerkUserId = await verifySessionToken(token);
  if (!clerkUserId) return null;

  const existing = await loadLocalUser(clerkUserId);
  if (existing) return existing;

  const profile = await fetchClerkProfile(clerkUserId);

  if (profile.externalId && env.devSeedUserMapping) {
    const seedUser = await resolveSeedMappedUser(
      profile.externalId,
      profile.email,
    );
    if (seedUser) return seedUser;
  }

  return createUserFromClerkProfile(clerkUserId, profile);
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
  const normalized = normalizeEmail(email);
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
