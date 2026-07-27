# 2026-07-27 - Member slug backfill + hostId fallback in topic permalinks

## What happened

QA: all of one host's topics in the Analysis page's topics analysis
table rendered as bare text instead of links. `topicPath` returns null
when the host's member slug is missing, and migration 0018 (per-forum
profiles) backfilled membership slugs **from the old global
`users.slug`** — so accounts that never had a global slug minted came
through with `slug = NULL`. Every membership-creation path mints a slug
today; only these pre-profile rows were stranded.

## Fix 1: migration 0019 (data-only)

`0019_backfill_member_slugs.sql` mints slugs for `slug IS NULL`
memberships in a PL/pgSQL loop mirroring core's `ensureMemberSlug`:
slugify the member name ('user' fallback), guard reserved route
segments, append `-2`/`-3`… on collision within the timetable. A loop
(not the set-based numbering trick from 0008) because this table
already has non-null slugs the candidates must dodge. Data-only, so
`0019_snapshot.json` is a copy of 0018's with a fresh id chained via
`prevId`, plus a `_journal.json` entry — there is no schema diff for
drizzle-kit to generate.

## Fix 2: `topicPath` degrades to hostId

`topicPath(timetable, hostSlug, topicSlug, hostId?)` now falls back to
the host **id** for the host segment when the slug is null. The
permalink route resolves by topic slug alone and canonical-redirects
stale host segments, so an id there works and self-heals. This keeps
topics reachable in the one case the backfill can't cover: hosts who
left the forum (their membership row — and slug — is gone entirely).
Callers with a hostId in hand pass it (feed/moderation cards, topic
manager, topics analysis table, elector hearts list); the permalink
page's own canonical computation deliberately stays slug-only so it
never redirects *toward* an id URL.
