# 2026-08-04 — Host 💙s: a parallel gesture that never touches the vote

Hosts had no heart affordance: electors drive the programme with ❤️s, and
host enthusiasm had to be typed into a comment. This adds 💙s — a parallel,
deliberately inert gesture for hosts — designed so it cannot distort the
elector vote or set up an inter-host popularity contest.

## The design (converged with Ed over several rounds)

- **One person, one gesture.** Your roles decide it: electors ❤️ (even if
  they also host), only host-non-electors 💙 (`canHostHeart`). In a forum
  where every host is also an elector, nobody is eligible — the feature
  self-disables with no flag.
- **💙s never affect anything electors see.** They live in their own
  `host_hearts` table; the elector pipelines (weights, feed ranking,
  digests' ❤️ math, analytics ❤️ columns) are untouched by construction.
- **Attribution is host-visible, tallies are admin-only.** The host-only
  comment thread shows "💙 Sarah, Amir" (and a count in its collapsed
  trigger); who-💙'd-what across topics — counts, the four normalisations,
  sorting, per-topic host breakdowns — is admin-eyes-only
  (`canSeeHostHeartTallies`). No peer leaderboard.
- **Unaffected by `heartsCountFrom` resets** — a 💙 is interest, not a
  ballot. (Revisitable; the cutoff read would be one condition.)
- **Honest copy everywhere**: the 💙 button's tooltip says who can see it.

## Surfaces

- **Queue**: host-non-electors' switch binds to 💙 (`hostMode` on
  `QueueControls`) — they finally get a live switch instead of read-through.
- **💙 Topics**: `/topics?hearted=host` mirrors electors' `?hearted=me`
  (nav link, page head, empty state, infinite scroll).
- **Topic cards**: the 💙 toggle + attributed row + count all live INSIDE
  the host-only comments panel (QA same day: it started in the actions row
  next to the elector ❤️, but placement inside the box makes "only hosts
  see this" self-evident).
- **Analysis**: admin-only 💙 optgroup on the topics table (all four
  normalisations — `shared/hearts.ts` math reused verbatim over
  `host_hearts` rows: "each host distributes one unit of interest across
  their 💙s"); under a 💙 sort the row expander shows hosts
  (`topicHostHeartBreakdown`, mapped into the existing `BreakdownTable`);
  the host-activity table gains a "💙 given" column, and each host row
  folds open into the topics they 💙'd (same `HeartedTopicsTable` as the
  elector rows' ❤️ fold; "Comments" there is that host's own comments on
  the topic).
- **Digests**: "💙 Eli Morgan" lines under the ❤️s on a host's topic card,
  and a subject count — gated by the host-comments option (below), so the
  email never leaks what the UI hides.

## Host-only comments become a forum option

`settings.hostComments.enabled` (default ON — `isHostCommentsEnabled`).
Forums where hosts=electors can switch the faculty backchannel off:
the thread and 💙 row hide (nothing is deleted; new `host_only` comments
are refused API-side), digest 💙s stop, and 💙s degrade gracefully into
private bookmarks that only admins see in Analysis. Admin toggle in Forum
Settings (`HostCommentsForm`).

## API gating notes

- `hostHeartTopic` mutation: `canHostHeart` (host AND NOT elector).
- Dashboard 💙 fields ride the existing host-visible dashboard query but
  resolve to null for non-admins (per-row `showHostHearts` flag) — the
  gate is finer than the query's `canSeeHostOnly`.
- `Topic.hostHearters` needs `canSeeHostOnly` AND the forum option;
  `viewerHasHostHearted` is prefetched batched per page, only for eligible
  viewers.

## Seed

`## Host hearts` section in `dev-sample-data.md` (13 topics, 29 💙s across
the eligible hosts), validated to the same rule as the app: host role and
NOT elector — `host-eli` (host+elector) can never appear. Rows share the
❤️s' digest-day window.

Schema: purely additive (`host_hearts`, migration 0028) — no enum changes,
no backfill.
