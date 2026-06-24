## 2026-06-24T21:21:06Z - Clerk Dev Seed Users

### Goal

Allow Ed's sample people to be mirrored into a Clerk development instance so
hosts, electors, and the owner/admin can sign in against the seeded dev
timetable.

### Changes

Added `npm run clerk:seed-dev-users`, backed by an API workspace script that
reads `dev-sample-data.md`, creates or updates Clerk users, and stores the
deterministic local fixture id in Clerk `externalId`.

The database seed module now exports its fixture parser/id helpers and no
longer runs when imported. Sample fixture emails now use the Clerk development
test-email form, for example `admin-edwin+clerk_test@sample.timetable.test`.

API Clerk auth now resolves a Clerk user's `externalId` to an existing local
fixture user before creating a new local row, so the seeded timetable
memberships survive Clerk's generated user ids.

The hosted dev `seed_sample_data` deploy checkbox now runs a destructive dev
app-data reset, reseeds the database fixture, and then runs the Clerk user seed
in the same DigitalOcean post-deploy job.

### Decisions

Used Clerk `externalId` rather than rewriting seeded database foreign keys to
Clerk-generated ids. This keeps `npm run db:seed` deterministic and lets the
Clerk user seed be rerun independently after sample data refreshes.

The Clerk user script refuses non-`sk_test_` secret keys, because it is
intended only for local or hosted development fixtures.

The database seed's full-reset behavior is opt-in through
`SEED_DEV_RESET_DATABASE=true` or `--reset-dev-database`; the normal local
`npm run db:seed` path keeps its previous sample-timetable-only replacement
behavior.

### Tradeoffs

The fixture parser still lives in `seed-dev.ts`; it is now an import-safe module
rather than a fully separate parser package. This keeps the change small but
means consumers import from `@timetable/db/dev-seed`.

For fixture users, API auth must fetch the Clerk user when there is no local row
with the Clerk `sub`, so it can inspect `externalId`. That is acceptable for the
dev seed path but should not become a high-volume production mapping strategy
without caching or a first-class mapping table.

### Risks

The script was not run against a real Clerk development instance in this pass,
so Clerk dashboard configuration could still reject user creation if required
fields differ from the documented email-only setup.

Existing Clerk sample users with a different primary email are left in place and
reported with a warning rather than forcibly replacing their email address.

### Verification

Ran `npm run typecheck --workspace @timetable/db`, `npm run typecheck
--workspace @timetable/api`, and full `npm run typecheck`.

Also ran the Clerk seed command with `CLERK_SECRET_KEY=sk_live_fake` and
confirmed it exits before Clerk API work with the expected non-development-key
error.

Validated `.do/app.dev.yaml` schema-only with `doctl apps spec validate
--schema-only`.

### Demo Impact

A developer can now manually run `Deploy Dev` with `seed_sample_data` checked to
refresh hosted dev's seeded app data and Clerk sample users together, then sign
in as the owner/admin, hosts, or electors using the listed `+clerk_test` emails
and Clerk's development OTP code.

### Customer-Facing Context

The dev fixture remains isolated from production keys and data. Auth identities
are created in Clerk, while fixture authorization stays deterministic in the app
database through explicit `externalId` mapping.

### Next Recommended Step

Run the manual `Deploy Dev` workflow with `seed_sample_data` checked, then
verify one host and one elector can sign in and land on the `spt-test-data`
timetable with the expected roles.
