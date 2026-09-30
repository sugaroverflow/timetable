# {host} Lounge — design note (Ed, 2026-09-30)

Hosts asked for a private place to talk to each other. Decided: ONE
comment-shaped room per forum, not private topic-shaped posts — a private
topic would need a hide-from-non-hosts filter on every topic reader (feed,
search, analytics, digests, export, Atom/ICS, OG images), and one missed
filter leaks faculty conversation to electors. A room in its own table is
private by construction: nothing that exists today reads it.

Why in Topic at all (when electors are told to make their own spaces
elsewhere): faculty visit campus every 1–3 months and the digest is their
front door. A Slack they'd never open; a Lounge in their digest they will.

## Decisions (Ed, 2026-09-30)

1. **Name:** "{host} Lounge" (host role label, so "Faculty Lounge" on
   Newspeak) — in the nav and in the digest. Identifiers: `lounge`.
2. **Who:** owner, admins, hosts. Deactivated members fall out for free
   (`getViewerRoles` → none). Electors never.
3. **Forum Setting:** on/off, **off by default** — no forum sprouts a
   Lounge unannounced.
4. **Storage:** a NEW table (`lounge_comments`), shaped like `comments`
   (parent, author, body, hidden, deleted, edited, pinned) — not a
   nullable `comments.topicId`, whose existing readers all assume a topic.
   Additive migration only (R11).
5. **Threaded**, reusing the topic thread's presentation: top-composer,
   chains read oldest → newest, chain-tail composer.
5a. **Starting a conversation** is deliberate: a round "+" action button
    (Lucide `Plus`, icon-only, accessible name and tooltip "Start a
    conversation") — beside the page heading on desktop, floating
    bottom-right under 640px (clearing the iOS safe area, z-index from the
    `tokens.css` scale, list padded so it never covers the last message,
    hidden while the composer is open). On desktop the composer expands
    under the heading; on mobile it opens as a full-screen sheet (Base UI
    Dialog). It opens a larger composer (Discourse's New Topic pattern) using
    the topic editor (`RichTextEditor` — Markdown source, server-side
    sanitizer as the boundary). Replies keep the quick inline plain-text
    composer. Editing a conversation's opening post reuses the rich
    editor. The digest shows a plain-text excerpt of the opening post;
    @mentions are parsed from the Markdown source. The composer keeps
    its draft through topic-draft-recovery (`useStoredDraft`, key
    `lounge-new:<slug>`), since these are topic-length pieces of writing.
    The editor's image button stays (same Spaces upload path as topics).
6. **Top-level order: bump** — most recent activity (post or any reply in
   the conversation) first, pins above. A revived six-week-old
   conversation surfaces instead of hiding under newer ones, which matters
   for a room that never ends and hosts who visit rarely. Paginated by
   last activity ("Show older").
7. **Nothing moves while you're reading:** arrivals don't reorder an open
   page; order changes on reload (same principle as `orderRoots` keeping a
   just-posted comment above the pins).
8. **Pinning: admins only** (a room has no author to own it).
9. **@mentions work**, limited to people who can see the Lounge
   (notifications pane + the digest's Lounge card — see 10).
10. **Digest:** a "{host} Lounge" kind — new conversations plus replies in
    chains you're in — on by default for hosts; reuses digest
    click-to-read and a per-user read watermark (also drives the nav's
    unread dot). **Always the LAST section**, after the topic cards. ONE
    card: each active conversation in bump order — opening-post excerpt,
    new replies threaded beneath (the digest's existing chain grouping);
    Lounge @mentions ride it rather than the mention kind's topic cards.
    **Not in the subject line's counts** — a Lounge-only digest still
    sends, under the bare "{Forum} Topics Digest" subject.
11. **Last activity:** posting in the Lounge counts
    (last-activity-signals).
12. **JSON export: excluded** (as Contact Details).
13. **Slot chat stays out of the digest for now** — same gap, separate
    follow-up.

## Emoji reacts (Ed, 2026-09-30)

The first reactions in the codebase. A `lounge_reactions` table (message,
user, emoji; unique per triple); chips under the message show emoji +
count, names on hover/tap; click a chip to add or remove yours.

- **Any emoji, via an open-source picker** (library choice open — see
  below). OS pickers can't be opened from a web page, only typed into an
  input, so they don't give a react button.
- **❤️ and 💙 excluded** — in Topic those are weighted votes, not
  reactions.
- **Never in the digest, never a bump** — a react is acknowledgement,
  not news.
- **Counts as Last activity.**

## Scope fences (NOT building)

No titles/subjects (pins cover standing threads) · no multiple rooms or
channels · no ❤️s on messages (as hearts) · no elector room · no
cross-forum room · no drafting · no posting-norms prompt, slow mode or
batched publishing · no read receipts, typing indicators or presence.
