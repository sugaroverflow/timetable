# 2026-09-11 — A deactivated member's ❤️s and comments stop counting

## The ask

Ed: "Deactivated users shouldn't appear in Analysis page tables." Then,
mid-build: "We don't want to count hearts and comments from deactivated
people either." Asked how far the hearts rule reaches — Analysis only,
or everywhere — Ed chose **everywhere**: "if it's much simpler, we can
also deactivate all of their public hearts (i.e. they're not shown
anywhere while they're deactivated)."

## Why everywhere, and why at read time

The Analysis leaderboard's ❤️ scores are not computed on the page; they
come from `buildFeed`, the same weighted feed that ranks All Topics and
draws the ❤️ count and avatar breakdown on every card. An Analysis-only
recount would have left the page disagreeing with the cards for the same
topic. So the exclusion lives at the source.

Member-deactivation deliberately keeps every row (it is reversible), so
marking the heart rows at deactivation time would have meant a migration
AND a check in every reader. Filtering at read time needs only the
check, so that is the whole mechanism: **`active-member-filter`**,
`givenByActiveMember(userIdCol, timetableIdCol)` in
`packages/core/src/activeMember.ts` — a `NOT EXISTS` against the giver's
membership with `deactivated_at` set. `NOT EXISTS` rather than a join so
a heart from someone REMOVED from the forum (no row) keeps counting
exactly as before; this only knows about deactivation. Reactivation
restores everything, since nothing was written.

## Where it applies

- **Analysis tables + counts** — `loadMembers` in `analytics.ts` skips
  deactivated memberships, so the Host and Elector activity tables and
  the elector/host header counts lose the person (the original ask).
- **Analysis 💬 metrics** — `loadCommentTallies` (elector-authored
  comment scores per topic) skips deactivated authors.
- **❤️ everywhere** — `loadPublishedHearts` (`topics.ts`), the single
  source for heart weights: All Topics ranking, card ❤️ counts, the
  weighted breakdown, other electors' denominators, the export, and the
  Analysis leaderboard.
- **💙 everywhere** — `loadPublishedHostHearts` and
  `listTopicHostHearters` (`hostHearts.ts`), plus the Analysis 💙 scan
  `loadHostHeartActivity`.
- **Calendar audiences** — the `hearted_topic` / `hearted_mine` slot-post
  audiences no longer include deactivated hearters.
- **Host digests** — the "new ❤️ / 💙 on your topic" lines skip a hearter
  who has since been deactivated, so a host isn't told about a heart the
  card no longer shows.

## Deliberately untouched

- Comments stay visible in threads with their byline (the reason
  deactivation exists), and the card's 💬 count still counts them — it
  is the number of comments in the thread. Only the Analysis 💬 metrics
  exclude them.
- The `all` slot-post audience is role-based, not heart-based; Ed
  narrowed deactivation's notification pause to email, so in-app reach
  is unchanged.
- Hearts from REMOVED members (no membership row) still count, as they
  always have.

## Verification

No local stack on this machine; typecheck, lint and the vitest suites
pass, and the generated SQL was rendered with `toSQL()` to confirm the
correlated `NOT EXISTS` binds the inner `timetable_memberships` to the
subquery even where the outer query left-joins the same table for the
topic's host. To QA on dev: deactivate a member who has ❤️'d something,
then check All Topics order, the card's ❤️ count, and the Analysis page;
reactivate and watch them return.
