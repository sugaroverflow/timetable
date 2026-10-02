# 2026-08-16 — the workbench rows carry the slot chat

Ed: "In my-topics calendar work bench, you should be able to see the
calendar chat on each of the date rows; it's unintuitive that they don't
work the same as on the calendar page in this regard."

This reverses a decision from 2026-08-14 ("no comments in the panel —
dashboard only"). Ed is right that the reason it looked wrong is the
stronger argument: a timeslot has one conversation, and a row that looks
like a calendar row should behave like one.

Unfolding a workbench row now opens the hearter avatars **and** the slot's
own thread — literally the same thread, through the same
`DiscussionPanel`, lazily fetched on first unfold exactly as the calendar
page does it. Rows carry the 💬 count too (new `commentCount` on
`topicSlotFit`, straight off `buildCalendar`), so a slot announces its
chat before you open it.

Details:

- `DiscussionPanel` took a whole `CalendarSlot` and a `CalendarPerms`; it
  only ever used the id, the counts, the viewer id and "may I hide". It
  now takes those four directly, which is what let the workbench reuse it
  without inventing a fake slot.
- Posts from here are **plain comments**, not claims. The claim chip is
  the calendar's audience-lens gesture; the workbench's lens is implicit
  and attaching snapshots silently would surprise people reading the same
  thread from the calendar page. Easy to switch on if Ed wants it.
- Pinned "Your sessions" rows keep avatars only. They're locked open, and
  a locked-open thread per pinned row would bury the summary they exist to
  be; the same slot is one row further down with its chat.
- `WorkbenchRow` and `TopicScheduleBody` both passed lint limits with the
  addition, so the file now has `PinnedSessions`, `SlotList`,
  `OthersLine`, `ChatCount` and `foldHandlers` as named pieces, with a
  `SharedRowProps` bundle for what every row needs.

## Round 2: the claim chip belongs here after all

Ed, straight after: "I think the claim chip should be included in
workbench comments."

Right — I had reasoned that claims were the calendar's lens gesture and
the workbench's lens was merely implicit. But it isn't implicit at all:
the panel IS one topic's lens, and the wash the host is reading while they
type is precisely the snapshot the server freezes onto the comment
(`computeSlotCounts` over that topic's hearters — the same audience
`topicSlotFit` builds the row from). Posting "could we do this one here?"
with 🟢 5 🟡 2 attached is the whole point of arguing for a slot.

So `lensTopic` is now this topic, and the composer shows the same live
preview chip the calendar page shows under its lens. The only change
needed was the panel's own title, threaded through as `topicTitle`.

`DiscussionPanel.lensTopic` is typed structurally (`{id, title}`) rather
than as a `TopicOption`, since the workbench has no host/heart-count
fields to hand and never needed them.
