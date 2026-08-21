# A Back button on the Topic Queue (Ed, 2026-08-21)

Ed: there should be a "back" button on the topic queue, on the left.

Two readings, and he picked: **re-show, don't rewind.** Back displays the
topic you just passed with your ❤️ as you left it and still editable;
nothing is un-done. His words: *going back does not make something
unseen*. So `remaining` and the "3 of 12 this round" counter never move,
and you can keep pressing to walk further back.

## Where the history comes from

The queue is a per-user deterministic shuffle: everything not yet reviewed
this round, sorted by `md5(userId:topicId)` with just-published topics
jumping ahead. `current` is simply the first of those.

Apply that SAME comparator to what has been reviewed and you get the order
those topics were shown in - so the history needs no new storage, just the
other half of a sort the queue already does (`historyIds` on
`TopicQueueState`). Deliberately NOT ordered by `seenAt`, which looks like
the obvious choice and is a trap: hearting bumps the seen mark, so
re-❤️ing a topic three steps back would yank it to the front of your
history mid-walk.

The one wart: a topic published mid-round sorts with the new-first group,
so if you review it late it appears earlier in the history than you saw
it. Rare, and the alternative is worse.

## The shape

`?back=n` on the queue page. The step lives in the URL, so it is ordinary
navigation - the server renders the history topic instead of the live one,
the browser's own Back works, and nothing about it writes. Out-of-range
values clamp to the live topic.

The right arrow mirrors the left: one step forward, landing on the live
topic at step 0, where it goes back to being the Next that marks seen and
advances. The left arrow is smaller and quieter than Next - revisiting is
secondary to deciding - and is rendered disabled rather than absent on the
first card of a round so the ❤️ switch doesn't shift sideways when
history appears. The done screen gets the same step as "Look back at the
last topic", since the end of a round is exactly where "wait, go back"
happens.

One thing Ed didn't specify: the round counter would be a lie under an
older topic, since it counts where the QUEUE is, not what you're reading.
While looking back it reads "Looking back · 2 topics ago" instead. The
counter itself still never moves, which is what he asked for.
