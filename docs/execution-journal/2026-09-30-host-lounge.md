# 2026-09-30 — The {host} Lounge (host-lounge)

## The ask

Hosts asked for a private place to talk to each other, away from any one
topic. Ed worried about scope creep: topic-shaped private posts would need
new drafting UX and more he hadn't thought of yet.

## Why a room, not private topics

A topic carries status, ready, ❤️s, tabs, sessions, digests, analytics,
the export, Atom/ICS feeds and OG images. A private topic would need a
hide-from-non-hosts filter on every one of those readers (the
active-member-filter precedent), and one missed filter would leak faculty
conversation to electors. A comment-shaped room in its **own tables** is
private by construction: nothing that exists reads them.

Why in Topic at all: faculty visit campus rarely and the email digest is
their front door.

## Decisions (Ed, 2026-09-30)

Recorded in full in `docs/host-lounge-plan.md`:

1. Name "{host} Lounge" (nav + digest). Route `/f/[slug]/lounge`.
2. Owner, admins and hosts; never electors. Forum Setting, **off** by
   default.
3. New tables, not a nullable `comments.topicId`.
4. Threaded. **Bump order**, pins first; **nothing moves while reading**;
   chains read oldest → newest.
5. A round **"+"** starts a conversation — beside the heading on desktop,
   floating on phones (full-screen sheet there) — in the rich-text editor,
   with images (pasted by URL, as topics).
6. Admins pin. @mentions work. Emoji reacts: any emoji via a picker, not
   ❤️/💙; never digested, never a bump.
7. Digest: one card, always **last**, **not** in the subject line. Counts
   as Last activity; excluded from the JSON export.
8. Scope fences: no titles, no channels, no ❤️s on posts, no elector room,
   no cross-forum room, no drafting, no posting prompts / slow mode /
   batched publishing, no read receipts or presence. Slot chat stays out
   of the digest for now.

## What was built

- **Migration 0044** (additive): `lounge_comments` (root/parent/`root_id`,
  `last_activity_at` for bump order, hide/delete/edit/pin),
  `lounge_mentions`, `lounge_reactions`,
  `timetable_memberships.lounge_seen_at`, `digest_sends.lounge_shown_until` (a digest click marks the Lounge read
  up to the newest post the card showed, never the send time).
- **Shared:** `isLoungeEnabled`, `canUseLounge`, the `lounge` digest kind
  (audience host), `normalizeReaction` (one emoji grapheme, ❤️/💙
  refused). Tests.
- **Core:** `lounge.ts` (post, reply-and-bump in one transaction, edit,
  soft delete, hide, pin, react, keyset-paged `listLoungePage`, read mark
  with GREATEST, unread check; mentions resolve only to members who can
  enter), `loungeDigest.ts` (the card), Lounge kinds in notifications,
  Lounge sources in Last activity.
- **API:** `graphql/lounge.ts` — one gate (`mayEnter`) on every field and
  mutation; refusals read as not found. Forum setting `loungeEnabled`;
  token scopes (`comments:write`, `feed:write` for the read mark).
  Integration tests: electors and switched-off forums see nothing, ❤️
  react refused, only admins pin. Digest renderer tests: card last, not in
  subject, Lounge-only digest still sends.
- **Web:** the page + `LoungeRoom` (own fetching so older pages stay
  current; `stableOrder` keeps the reading order), `LoungeComposer`,
  `LoungeReactions` + lazy `LoungeEmojiPicker` (Frimousse,
  emojibase-data 17 vendored in `public/emojibase` — the CSP blocks the
  CDN default), nav link with an unread dot, Forum Settings switch,
  Lounge kinds in Notifications. The thread components now take their
  mutations from `commentThreadAdapter` (topic comments by default) — one
  thread implementation for both surfaces.

## Review pass (same day)

An independent review found no privacy leak to electors or outsiders, and
seven correctness issues, all fixed before merge: replies were refused
under a deleted post (a dead-end composer); hidden conversations could
still be written to from a stale tab and their replies still notified;
a digest click marked unshown posts read; concurrent replies could move
a bump backwards; the "Show older" cursor could skip a sub-millisecond
bump time; a reload could drop the conversation the reader had just
acted on; and a `?c=` link on the same route didn't bring its
conversation in.

Accepted as is: whether a forum has the Lounge switched on is visible in
the forum's public settings JSON, as the calendar and host-thread
switches already are — never any content.
