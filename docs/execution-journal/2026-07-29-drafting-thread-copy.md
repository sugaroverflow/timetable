# Drafting-thread copy: audience-first, viewer-relative

Ed (launch QA): the drafting thread's "Add a admin note…" placeholder "is
a strange prompt to hosts", and the "{Dean} comments" heading should say
who can see the thread instead.

The panel's copy is now viewer-relative (the thread's true audience is
the topic's owner + admins, and the words shouldn't imply otherwise to
either side):

- **Host view**: heading "Comments (you and {Deans} only)"; composer
  placeholder "Add a comment… (only you and {Deans} can see this)".
- **Admin view**: heading "Comments (the {Host} and {Deans} only)";
  placeholder "Add a comment… (only the {Host} and {Deans} can see
  this)" — the host is named so no admin assumes the thread is
  admin-private.
- Expanded toggle is just "Hide comments"; the count shows only when
  non-zero (the panel auto-expands when comments exist anyway).
- Success toast is "Comment added" (was "{Dean} note added").

Mechanics: `AdminCommentsPanel` gains `hostLabel` and builds the strings
with `pluralLabel`; `CommentComposer` gains optional
`placeholder`/`successMessage` overrides (its scope-derived defaults
still serve the {host}-only thread). Call sites passing `hostLabel`:
ModerationCard and the permalink page's DraftingThread (admin views);
TopicManager's host view doesn't need it.
