# Deep housekeeping pass (4-agent audit → one sweep)

**Date:** 2026-08-13
**Trigger:** Ed asked for a deep refactor/housekeeping pass after the
dialogue-first threading work. Four parallel read-only audits (web dead
code, backend dead code, duplication/complexity, stale docs) produced the
findings; the high-confidence tier landed here, the rest is recorded
below as deliberately deferred.

## Landed

**Dead code removed:** `findUserByEmail`, `getUserProfile`, `hasRole`,
`DEFAULT_ROLE_LABELS` (definition-only exports); five dead CSS blocks
(`.slot-date` widget, `.slot-expand`, `.slot-when`, `.person-name-link`,
`.cal-past-row .topic-body-toggle` — all pre-table-calendar/person-chip
leftovers); an unused import, a dead re-export, and the `resetPage`
option (deleted a `page` param nothing ever set); `FeedTopic.timetableId`
and `FeedComment.parentId` dropped from the web fragments/types (fetched
at every tree level, read nowhere — the API still exposes both).

**Shared primitives (new `packages/shared/src/feedSorts.ts` +
`display.ts`):**

- `FEED_SORTS`/`isFeedSort` — the sort list existed in three hand-kept
  copies that had already diverged (API accepted `hearts`, web's list
  omitted it); core's `FeedSort` now derives from it, API validation and
  web normalization import it.
- `topicPath` — web and digest emails had different implementations, and
  the digest one silently dropped the email link for topics whose host
  has no member slug (no id fallback). One shared function; **real bug
  fixed**.
- `avatarSlot`/`initials` — the colour hash was byte-identical in
  Avatar.tsx and email.ts; the palettes stay separate by necessity
  (CSS tokens vs literal hexes) but the hash can no longer drift.
- `HEX_COLOUR` — the SSR/OG colour-injection guard, was five copies.
  EXCEPTION: `ogCard.tsx` keeps a local mirror — see the new CLAUDE.md
  gotcha (opengraph-image bundles can't resolve workspace packages;
  typecheck passes, dev server dies at request time).
- `FONT_PAIRINGS`/`BRAND_FONTS` now typed against shared
  `THEME_FONT_KEYS`/`BRAND_FONT_KEYS` — a key added without a stack fails
  the build (no drift existed).

**All three 2026-07-22 "audit debt" lint disables cleared:**

- `topicFeed`/`topicPermalink` (api topics.ts): new `topicViewFlags`
  (was FOUR hand-kept copies of the flag block — feed, permalink,
  unpublished branch, queue), `decorateFeedTopics` (flags + 💙s + ONE
  batched comment-tree prefetch; the permalink's published branch now
  uses the batch too), `feedOptionsFromArgs`, `unpublishedPermalinkTopic`
  + `EMPTY_TOPIC_METRICS`. Note: unpublished permalinks now carry
  `hostCommentsEnabled` (harmless — 💙s can't exist pre-publication).
- `updateForumSettings` (api timetables.ts): five per-concern patch
  builders (`roleLabelPatch`, `themePatch`, `brandingPatch`,
  `digestPatch`, `featurePatch`) mirroring the web forms that send each
  subset; the resolver is now auth + spread-compose + persist + log.

**Structure:** `email-sample.ts` split out of `email.ts` (620 lines of
fixture data + its max-lines disable leave the production module);
`FeedQuery` object replaces the 9-positional-parameter chain declared
four times across `fetchFeedPage`/`loadMoreFeed`/`InfiniteFeed` (the two
person-page calls were hole-counting positional blanks);
`BadgeNavLink` (three copies of the 999+ badge link); `MANAGED_TOPIC_FIELDS`
fragment (My Topics + Pending selections); `forumWantsKind`/`eligibleForums`
in digests (six copies of the kind-eligibility ladder).

**Docs:** PRODUCT.md's Comments and Email sections rewritten for
dialogue-first threading + the sixteen per-forum digest kinds +
engagement-based seen/click-to-read; ARCHITECTURE.md's core-table list
gains `comment_mentions`/`topic_seen`/`comment_seen`/`digest_sends`,
membership-columns and mutations lists completed, "queued fixes" note
corrected (all three shipped).

## Deferred deliberately (from the audits, for a future pass)

- Untested `packages/core` dedupes: heart/hostHeart collector + analytics
  loader unification, digest comment-collector terminal-map extraction,
  digests.ts 3-file split — write unit tests first.
- `RenderCtx` threading in email.ts; `authed()` wrapper in rest/router.
- `ParamSelect` (nine filter components), `ActivityRow`+`TimeAgo` (found
  a real inconsistency: elector activity rows link by id where host rows
  prefer slug — needs elector slug threading to fix).
- Data-migration questions: `users.emailVerified` (dead column), `revoked`
  invite status + `archived` topic status (unreachable enum values),
  deprecated `digestNewTopics/Replies/Activity` flags (removal needs a
  backfill), the user-level digest-settings fallback layer.
- Lazy Pothos resolvers for `Dashboard.slotCount/topicCounts/
  unallocatedTopics/availabilityCount` (always computed, rarely selected —
  the one deferred item with a runtime payoff).
- Public-API redundancies (`forumByDomain` vs `forumRouteByDomain`,
  `myMembership`, legacy theme args): deprecation notes, not removals.
