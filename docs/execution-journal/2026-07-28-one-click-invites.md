# One-click invites: Clerk sign-in tickets in the invite email

**Date:** 2026-07-28

Ed's QA: an invitee's journey was invite email → sign-in page → type
their email → wait for a second email → enter an OTP code. The OTP
exists to prove address ownership — but the invite email *went to that
address*, so clicking its link already is the proof.

Invited members always have a pre-created Clerk account (the
add-person flow creates it before the invite email is ever sent), so
the fix is Clerk **sign-in tokens**: `createSignInTicket` in
`auth/clerk.ts` mints a single-use, 30-day token via the backend API,
and the invite email's CTA becomes
`/sign-in?__clerk_ticket=…&redirect_url=/f/<slug>/topics`. Clerk's
`<SignIn/>` consumes the ticket and signs the member straight in — one
email, one click, landing in the forum. `claimInvitesForUser` then
attaches memberships on first sign-in exactly as before.

Failure-safe: if ticket minting fails (or for a re-used/expired link),
the email/sign-in page falls back to the existing OTP flow. The
bulk-invite endpoint for unknown addresses sends no email today, so
nothing to change there.
