# 2026-08-16 — your own sessions, at the top of the workbench

Ed, QA'ing the topic-workbench:

> sessions the host has pencilled should also be shown at the top of the
> list. they should look the same as the other slots but the avatar drawer
> is always open, and they have the "un-pencil" button

Two readings there, so I asked before building: does a pinned slot leave
its place in the list below, or appear twice? Ed chose **twice** — pinned
at the top AND still in its date position — and chose the pinned copy's
avatar drawer to be **locked open**, not merely open by default.

So the panel now leads with a "Your sessions" group: every slot this topic
is pencilled into or confirmed for, date-ascending, above the ordinary
list. The rows are the same `WorkbenchRow` with `pinned` set, which means
the same wash, the same date/time, the same pill, and the same Unpencil
button — the only differences are that the hearter avatars are always
showing and the row doesn't fold, so it carries no `role="button"`, no
tab stop, and no click handler. Nothing to click means nothing that looks
clickable but isn't.

Confirmed sessions are pinned too, not just pencils. A confirmed session
is even more "yours"; it simply has no Unpencil button, since undoing a
confirmation is the admins' to do.

The duplication is deliberate and worth remembering: the date list stays
complete, with no hole where your own slot used to be, at the cost of the
same slot appearing in two places. The "Your sessions" heading (the
calendar's own month-heading idiom) is there to make that read as a
summary rather than as a bug.

`WorkbenchRow` passed the lint complexity limit with the pinned branch, so
the right-hand cluster is now its own `PencilControls` component — status
pill plus the one action that changes it.
