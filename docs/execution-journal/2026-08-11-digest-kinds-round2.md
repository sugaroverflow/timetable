# 2026-08-11 — Digest kinds round 2: Ed's pruning pass

The nine original switches all survived; the set grew to seventeen, two
things stopped being switchable at all, switch visibility became
role-aware, and the defaults moved to Forum Settings.

## Admin overrides — never switchable

- **Sessions on your own topics**: an admin scheduling your topic is
  something you always hear about. Proposed and confirmed sessions on
  the recipient's topics now ride their cards unconditionally (they were
  previously not in the digest at all — the hearters heard, the host
  didn't).
- **Assignments**: same reasoning; the switch is gone, the card always
  comes.

## New kinds (all default on)

- **draftingComments** (host) — the you-and-admin drafting thread on
  your topics under review, split out of `comments` (which now covers
  the public + {host}-only threads).
- **commentsHearted / commentsHostHearted** (elector / non-elector
  host) — comments on topics you follow with a ❤️/💙; one shared
  collector; feed watermark; own topics, own comments, and
  replies-to-you excluded; a topic followed both ways (or an @mention on
  a followed topic) surfaces each comment once.
- **mentions** (everyone) — comments that @mention you, anywhere you
  can see; notifications watermark; previously in-app-only.
- **sessionsHostHearted** (non-elector host) — upcoming sessions for
  💙'd topics; asks stay ❤️-only.
- **newTopicsHost** (non-elector host) — colleagues' newly published
  topics; own topics excluded outright; dual-role members get the card
  when either applicable switch is on.
- **pendingReview** (admin) — "a new topic is ready to review": sourced
  from topic.submit activity events, only while the topic is still
  awaiting review, with a "Ready to review" pill.
- **slotReleases** (host) — new dates released on the calendar (future
  slots created since the window, e.g. a hall week) — its own email
  section.
- **newMembers** (admin) — first sign-ins since the window — its own
  email section.

## Role-aware switch visibility

`digestKindApplies(kind, roles)` (shared): host kinds, elector kinds,
💙 kinds for hosts WITHOUT the elector role (one-person-one-gesture: an
elector-host's 💙 rolls into their ❤️), admin kinds, universal kinds.
Members see only applicable switches, label scaffolding removed; admins
see everything with a "([role] only)" tag, inapplicable rows greyed.
Saving writes only the switches the member can use.

## Forum-level defaults

`TimetableSettings.digestKindDefaults` (all-on until touched), edited on
the Forum Settings Email digest card, saved via
`updateForumSettings(digestKindDefaultsJson:)`. Resolution:
membership switch → forum default → global all-on default.

## Late additions (same day)

- **The review queue is a standing listing**: `pendingReview` now carries
  EVERY topic currently awaiting review (like draft reminders), not just
  since-window submissions — only fresh ones count as send-triggering
  news (`pending.isNew`, from `topics.updatedAt`).
- **The test digest is a full showcase**: several examples of every kind
  (tagged per switch), filtered by the forum's configured kind defaults —
  the "Send test digest" button now previews exactly what a default
  member's digest carries; admin overrides always included.
- **Drafting-thread label**: the panel reads "Comments (you and {Admins}
  only)" for every viewer (Ed — "the {Host} and {Admins}" read as the
  whole faculty); the admin composer hint still names the owner so nobody
  assumes the thread is admin-private.

## Round 3 (same day) — QA on the switch cards

- **draftingComments folded back into comments** (Ed: "it's just a type
  of 'Comments on your topics'"): the kind is gone from DIGEST_KINDS;
  admin_only comment rows now ride the `comments` switch. Stored
  membership/forum JSON with the old key parses fine (unknown kinds are
  ignored on read, dropped on next save). 16 switches remain.
- **Role tags in the forum's own labels**: all role words (the admin
  "([role] only)" tags plus the "fellow hosts" labels) go through the
  forum's roleLabels ("Fellowship Candidate only", "💙s from fellow
  Faculty…"). Briefly shown to every viewer, reverted same day — Ed:
  members don't need the audience config, they just get switches that
  apply to them (a host-elector seeing asks is working as designed — the
  💙 rolls into ❤️ and elector switches follow the elector role).
  DIGEST_KIND_ROLE_TAGS left shared
  (hardcoded strings) for an exported DIGEST_KIND_AUDIENCE; the web's
  `taggedKindLabel(kind, roleLabels)` builds display labels for both the
  Notifications card and the Forum Settings defaults card.
