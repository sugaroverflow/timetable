# Web Push: adding the keys (one-time, repository owner only)

Phone and desktop alerts ("Web Push") are built and deployed, but switched
off. What switches them on is a key pair stored as GitHub environment
secrets, and only the repository owner can add those. This page is the
whole job: about 10 minutes, once.

How it works and why is in `docs/WEB_PUSH.md`; this page is only the steps.

## What you need

- Node 20 or newer on your own machine.
- A checkout of this repository on `main` (`git pull`).

## 1. Production (the one that matters)

1. In the repository, run:

   ```
   node scripts/generate-vapid.mjs
   ```

   It prints two lines:

   ```
   VAPID_PUBLIC_KEY=…
   VAPID_PRIVATE_KEY=…
   ```

   The **private** one is a secret. Paste it straight into GitHub (next
   step) and don't save it to a file, chat, email or ticket.

2. Open **GitHub → sugaroverflow/timetable → Settings → Environments →
   production → Add environment secret** and add three secrets:

   | Name | Value |
   |---|---|
   | `VAPID_PUBLIC_KEY` | the text after `VAPID_PUBLIC_KEY=` |
   | `VAPID_PRIVATE_KEY` | the text after `VAPID_PRIVATE_KEY=` |
   | `VAPID_SUBJECT` | `mailto:` and a contact address, for example `mailto:you@example.com` |

   The subject is only ever seen by the push services (Google, Apple,
   Mozilla, Microsoft), who would use it to contact us about abuse.

3. **Keep a private copy of the production private key** in a password
   manager. If it is ever lost, everyone has to turn alerts on again on
   each of their devices.

Add all three or none: with only some of them, production refuses to start
the new version (the old one keeps running) until the set is complete.

Nothing changes on the live site until the next production deploy, which
Ed runs.

## 2. Dev (same steps, separate pair)

Run `node scripts/generate-vapid.mjs` again for a **new** pair and add the
same three secrets to **Settings → Environments → timetable-dev**. Dev's
private key doesn't need keeping: losing it only means turning alerts on
again on dev. Dev lets us test on real phones before production, so it is
worth doing in the same sitting if you can.

## Rather not?

If you'd prefer not to handle this, you could instead give Ed (@edsaperia)
the **Admin** role on this repository (Settings → Collaborators and teams),
and he'll do it himself. Either way, just comment on this PR when it's done
and we'll take it from there.

## Afterwards (for us, not you)

- Dev: redeploy dev; the API logs `[api] Web Push on, key …` at startup.
  Then test on real devices (`docs/WEB_PUSH.md` §12, "Testing it").
- Production: Ed runs `deploy-production.yml` when dev has been checked.
- Pausing alerts without removing keys is the `PUSH_PAUSED` environment
  variable (`docs/OPERATIONS.md` R19).
