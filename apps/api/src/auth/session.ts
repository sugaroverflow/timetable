import { and, eq, gt } from "drizzle-orm";

import { db, sessions, users } from "@timetable/db";

import { parseCookies } from "../http/cookies";

export type SessionUser = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  bio: string | null;
};

/**
 * Auth.js database sessions are shared with the web app via Postgres. We accept
 * the various cookie names Auth.js / NextAuth use across versions and secure
 * contexts.
 */
const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

export async function getUserFromCookieHeader(
  cookieHeader?: string | null,
): Promise<SessionUser | null> {
  const cookies = parseCookies(cookieHeader);
  let token: string | undefined;
  for (const name of SESSION_COOKIE_NAMES) {
    if (cookies[name]) {
      token = cookies[name];
      break;
    }
  }
  if (!token) return null;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      bio: users.bio,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.sessionToken, token), gt(sessions.expires, new Date())))
    .limit(1);

  return rows[0] ?? null;
}
