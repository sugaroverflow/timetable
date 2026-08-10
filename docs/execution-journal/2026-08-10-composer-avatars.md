# 2026-08-10 — Composers wear the viewer's avatar, aligned with comments

Ed's QA: comment composers app-wide (topic public/host-only/drafting
threads, reply forms, slot chat on /calendar) now show the viewer's own
per-forum avatar on the left, with the form indented into the same
`.comment` row shape as posted comments — the composer previews what a
posted comment will look like.

- **`useViewerProfile`** (new lib hook): the AccountMenu's
  pathname→slug→`viewerProfile` fetch + "profile-updated" listener,
  extracted so composers get the avatar with ZERO prop-threading through
  the many callsites. AccountMenu now consumes the hook (behaviour
  unchanged).
- **`ComposerRow`**: `.comment.comment-composer` wrapper (avatar +
  `.comment-main`), used by `CommentComposer`, the reply form in
  `CommentActions`, and the slot-chat composer in `SlotDiscussion` (its
  claim-preview chip rides inside, staying aligned under the textarea).
- CSS: `.comment-composer > .avatar` gets `margin-top: 7px` — centred on
  the one-line 40px textarea rather than a username line.
- The nested forms' `inline-form-nested` top margin moved onto the
  wrapper row so spacing is unchanged.
