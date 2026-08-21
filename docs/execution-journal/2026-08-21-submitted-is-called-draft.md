# The "submitted" status is called "draft" (Ed, 2026-08-21)

Ed: the `submitted` state should be called "draft", because the topic is
not actually submitted for review or ready to publish.

He's right, and the app half-agreed already. A topic is created straight
into `submitted` (`core/topics.ts:65`) - there is no submission step and no
review step. The host's real "this is ready" signal is the separate
`readyAt` switch, which is what the admin Pending queue filters on, and
that queue has always labelled these topics **"still drafting"** vs "ready
to publish" (`ModerationCard.tsx`), with `topic.unready` reading "moved a
topic back to drafting". Only the host's own badge still said "submitted".

**Copy only.** The stored value stays `submitted` everywhere - DB enum,
GraphQL, TypeScript identifiers, the CSS `.status-submitted` class - for
two reasons: renaming a live enum value is a non-additive migration, which
the term-time policy forbids outright while a programme is running
(`docs/OPERATIONS.md` R11), and it follows the pattern set by the forum
rebrand, where user-visible strings moved and identifiers didn't. Both
badges now go through `topicStatusLabel` in
`apps/web/src/lib/topicStatusLabels.ts`, which is the single place to
change the word again.

Three strings came along because leaving them would have contradicted the
badge outright rather than merely being stale: a host with an unpublished
topic used to press **"Submit for review"** and land in a state now
labelled "draft", so that button is **"Return to draft"** (toast "Back in
draft") and the activity log's `topic.submit` line is "returned a topic to
draft". The API page's "pending (submitted) queue" and the export
payload's `pendingTopics` description followed the same word.

Watch out: "draft" now means THREE things in this codebase - the removed
draft STATUS, the live drafting THREAD (`admin_only` comments), and this
new label for `submitted`. The gotcha in `CLAUDE.md` spells all three out.
Never blanket-rename "draft" matches.
