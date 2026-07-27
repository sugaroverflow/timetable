# Housekeeping refactors after the launch-QA sprint

**Date:** 2026-07-27

Forty QA PRs in four days left predictable debris; this pass swept it in one
PR of mechanical, behaviour-preserving commits (plus #143 just before it,
which fixed the real bug the sweep surfaced: `metadataBase` was unset, so
every `og:image` URL pointed at `localhost:3000` and scrapers could never
fetch the social cards).

## Dead code removed

- **`users.slug` and `users.bio` columns** (migration 0021). Per-forum
  profiles (0018) copied both onto `timetable_memberships` and nothing read
  the originals since; the dev seed and the GraphQL `User.bio` chain
  (`SessionUser.bio` → `User.bio`, selected by no query) were the last
  writers/exposers and went with them.
- 12 CSS classes in `globals.css` with zero references — leftovers of the
  privacy pill, the bio modal, the draft-feedback UI, and old switcher
  markup.
- An unreachable `status === "draft"` branch in
  `scripts/generate-seed-comments.mjs` (the draft topic status is long
  removed).

## Deduplication

- `SortHeader` extracted to its own component (BreakdownTable had a
  byte-identical private copy).
- `canEditTopic` / `ownsTopicAsHost` in `packages/shared/src/permissions.ts`
  replace the `ownerHost || isAdmin` check copy-pasted across updateTopic /
  submitTopic / unpublishTopic. The two stay separate because admin edits of
  someone else's topic are activity-logged.
- `SelectMinimal` primitive: the chevron+select wrapper was copy-pasted in
  eight filters, and AudienceFilter/LocationFilter (calendar UI) had drifted
  to bare selects — all ten now share one component.
- Small helpers: `personPath` (person links were hand-built in four places),
  `parseDigestSettings` (three copies), `formatExactTime` (tooltip
  timestamps), `isOwner` from shared instead of `roles.includes("owner")`,
  and the Avatar hex palette moved into `tokens.css` (`--avatar-1…8`) per
  the no-raw-colours rule.

## Docs & config

- ARCHITECTURE/PRODUCT/README caught up with reality: `/f/` URLs, person
  pages, Analysis rework, `/admin`, Atom feed + export + forum-delete REST
  rows, OG cards, membership slugs powering permalinks, favicon shipped,
  description field removed, residual "drafts" wording.
- Flagged for Ed (agent credentials can't push workflow files): bump
  `actions/checkout` and `actions/setup-node` v4 → v5 in all four workflows
  (kills the Node 20 runner deprecation warnings; deploy-production.yml
  version bump only) and delete the dead `AUTH_SECRET` env var from ci.yml
  (read nowhere; there is no Auth.js).

## Deliberately not done

Big-component splits (SettingsForm et al.), the slots.ts permission-helper
swap (unreleased surface, behaviourally identical), and a `UserRef` naming
unification (invasive) — noted in the audit, skipped as churn > value.
