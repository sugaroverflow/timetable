import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";

import { claimInvitesForUser } from "@timetable/core";
import { accounts, db, sessions, users, verificationTokens } from "@timetable/db";

const EMAIL_FROM = process.env.EMAIL_FROM ?? "Timetable <no-reply@example.com>";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  pages: {
    signIn: "/login",
    verifyRequest: "/login/check",
  },
  providers: [
    Resend({
      // A value is required for the provider to initialize; real sending only
      // happens when RESEND_API_KEY is present (see sendVerificationRequest).
      apiKey: process.env.RESEND_API_KEY ?? "dev-no-send",
      from: EMAIL_FROM,
      async sendVerificationRequest({ identifier: email, url }) {
        if (!process.env.RESEND_API_KEY) {
          // Local dev: print the magic link instead of emailing it.
          console.log(`\n[auth] Magic link for ${email}:\n${url}\n`);
          return;
        }

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: EMAIL_FROM,
            to: email,
            subject: "Sign in to Timetable",
            html: `<p>Click to sign in to Timetable:</p><p><a href="${url}">Sign in</a></p><p>If you didn't request this, you can ignore this email.</p>`,
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Resend error ${res.status}: ${body}`);
        }
      },
    }),
  ],
  events: {
    async signIn({ user }) {
      // Turn any pending invites for this email into memberships.
      if (user.id && user.email) {
        await claimInvitesForUser(user.id, user.email);
      }
    },
  },
});
