# 2026-08-17 — activity log overhaul (Ed's ask)

Ed: review the action list, add what's missing, clearer names, more
specificity ("previewed the forum as [name] [role]"), and make every
reference clickable — comments deep-link to the comment on the topic
page.

## Coverage

- **💙 events finally labeled** — `hostheart.add`/`hostheart.remove`
  have been logged since 2026-08-04 but were absent from ACTION_LABELS,
  so they rendered as raw action names.
- **Three calendar writes now log** (they were the only unlogged ones):
  `slot.edit` (admin changes a timeslot's time/locations, with a note
  saying which), `slot.delete` (time + rooms preserved in the payload —
  the row is gone, so no link), and `slot_comment.hide`/`unhide`
  (moderation trace with a snippet, matching topic-comment hide).

## Specificity

- Events done TO a member (preview, bio edit, email change, role change,
  removal) now name them: "previewed the forum as **Jane** (Elector)" —
  a linked person chip plus their role at event time (`TARGETED_LABELS`
  + `TargetSuffix`; log sites enriched with targetName/targetRoles;
  role changes append the resulting roles).
- Calendar events show their timeslot ("pencilled a session — Mon 12
  Jan, 18:00"), `availability.set` leads with the 🟢🟡🔴 answer, and
  `slot.clear`/`slot.delete` name the room.
- The note block's attribution now shows the actor's real role — it
  hardcoded "(admin)", which lied for member slot-discussion notes.
- Wording pass over every label (❤️/💙 emoji per the copy convention,
  plain sentences).

## Links

- **Comment lines already linked to `#comment-<id>`** on the permalink;
  the landing now works properly: `.comment` gets topbar-clearing
  scroll-margin and the addressed comment's bubble wears a quiet
  `:target` ring so the eye finds it.
- **Timeslot references link to the calendar row**: `CalendarTable` grew
  an `anchorRows` prop stamping `#slot-<id>` ids — set ONLY by the
  calendar page's main chronology (Your Sessions repeats the same slots;
  duplicate ids would hijack the jump). Past slots route through
  `?past=1` so the row is actually rendered. Same scroll-margin +
  `:target` ring.
- Member targets link to person pages via the existing PersonChip.

GraphQL: `ActivityEvent` gains targetUserId/targetName/targetRoles/
rolesTo/slotId/slotStartsAt/availabilityState/location, all read from
payloads (`payloadString` tolerates the historically inconsistent key
names, so old rows enrich too).
