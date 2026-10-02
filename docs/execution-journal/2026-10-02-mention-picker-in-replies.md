# 2026-10-02 — @mention picker in replies (finishing #354)

## The ask

sirodoht's #354 ("fix(web): enable @mention autocomplete in replies")
put the @mention picker — until then only on the top-composer — into the
Reply box (`CommentActions`) and the chain-tail-composer, in public
threads only, by lifting the picker's people loading into a reusable
`ForumMentionTextarea`. It was correct on its base, but main had moved
on: the {host} Lounge (#357) introduced the comment-thread-adapter, and
the Lounge renders through the same `CommentList`. Ed asked us to finish
it ourselves. Their commit is kept as-is, with their authorship.

## What we added

1. **Merged main.** `CommentActions.tsx` takes main's side — the
   reply/hide/delete/pin mutations now come from the adapter
   (`TOPIC_COMMENTS`) — and keeps #354's `ReplyTextarea` helper and
   `mentionSlug` prop.
2. **Lounge replies offer only hosts and admins** (Ed's recommended
   option). `loungeThread.ts` marks Lounge posts `visibility: "public"`,
   so without this a Lounge reply box would have listed the whole forum,
   electors included — people the room is closed to, whom a Lounge
   mention resolves to nobody anyway (`recordLoungeMentions`). The adapter
   gained `mentionRoles?: readonly string[]`; the Lounge sets it to
   `LOUNGE_ROLES`, and `ForumMentionTextarea` reads it through
   `useCommentThread()`. `LOUNGE_ROLES` moved into `packages/shared`
   (`permissions.ts`, beside `canUseLounge`, with a test that the two
   agree) so the web app and core share one list instead of each keeping
   a copy.
3. **Deactivated members never appear in the picker.** `forumPeople`
   only sends them to admins (member-deactivation), so this mattered for
   admins: the picker now loads `roles deactivatedAt` and drops anyone
   with the stamp, on every surface.
4. **Server side, the same rule.** Core `recordMentions` (topic comments)
   now carries `isNull(timetableMemberships.deactivatedAt)`, as
   `recordLoungeMentions` already did — a hand-typed @handle of a
   deactivated member records no mention and so notifies nobody. No test:
   core has no database test harness, and the api integration suite mocks
   core.
5. **Lint.** The merge pushed `CommentItem` to complexity 13 (max 12);
   the public-only rule moved into a `mentionSlugFor(comment, slug)`
   helper in `CommentList.tsx`.

## Tests

`apps/web/src/components/MentionTextarea.test.tsx` (jsdom, the
QueueControls pattern): the picker never offers a deactivated member, and
inside a thread whose adapter sets `mentionRoles` it offers only those
roles. Both fail with the filter removed.

## Worth knowing

- The picker is a typing aid; the server decides who a mention reaches.
  Both now agree on deactivated members, and in the Lounge on roles.
- Host-only and drafting threads still get no picker (#354's
  public-only rule), so nobody is suggested a person who can't read the
  reply.
