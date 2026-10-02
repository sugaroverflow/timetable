# Open slot comments: every member joins the slot discussion

**Date:** 2026-08-14
**Trigger:** the scheduling-inversion design discussion with Ed — scheduling
should be demand-first ("❤️ implies I'd attend a session"), and what actually
happens in a slot should be discussed with everyone, not just hosts. This is
step one of two (the topic-workbench on My Topics is step two); nothing is
removed from the calendar page yet.

## Changes

- **`canDiscussSlots`** (`packages/shared/src/permissions.ts`): new named
  permission — any authenticated member (elector/host/admin). Applied to the
  `slotComments` read gate (silent `[]` for non-members, as before) and the
  `addSlotComment` write gate ("Members only") in
  `apps/api/src/graphql/slots.ts`.
- **Claim attachment stays host/admin**: `addSlotComment` now explicitly
  refuses a `topicId` from non-host/admin authors. Electors read claim chips
  (aggregate 🟢🟡🔴 counts, no names — Ed approved showing them as-is) but
  can't create them; the web composer never offered electors a lens anyway —
  the guard is defense-in-depth.
- **Calendar row expansion** (`CalendarTable.tsx`): `canExpand` is now
  `perms.canDiscuss` (new `CalendarPerms` flag from `buildPerms()`), so
  electors can unfold a row and read/post in the thread. Everything else
  keeps its own gate and is unchanged: tint washes and per-elector avatars
  (host/admin), session controls (canPropose/canAdmin), admin slot controls.
  The 💬 count chip follows `canExpand` automatically.
- Author edit/delete and admin hide/unhide already had the right gates
  (author-only / `canManageCalendar`) — untouched.

## Tests

- `permissions.test.ts`: `canDiscussSlots` truth table (members yes; guests,
  anonymous, sysadmin no).
- `app.integration.test.ts`: elector reads thread; non-member gets `[]`;
  elector posts plain comment; elector's claim attachment FORBIDDEN; host
  claim carries the computed snapshot; calendar-disabled post refused.

## Notes

- Part of the demand-first direction: the open slot thread is where the
  "politics" of scheduling gets its venue — collisions stay conversations,
  now with electors in the room.
- Deliberately NO copy explaining ❤️-implies-attend anywhere (Ed: it was the
  original implication).
