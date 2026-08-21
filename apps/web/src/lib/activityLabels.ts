/** Human labels for activity_events actions, shared by the timeline and its
 * filter. Wording pass 2026-08-17 (Ed): plain sentences, ❤️/💙 emoji per
 * the copy convention, calendar actions spelled out. */
export const ACTION_LABELS: Record<string, string> = {
  "topic.create": "created a topic",
  // The `submitted` status is called "draft" in the UI (2026-08-21) — this
  // event is an unpublished topic going back into it, not a submission.
  "topic.submit": "returned a topic to draft",
  "topic.ready": "marked a topic ready to publish",
  "topic.unready": "moved a topic back to drafting",
  "topic.publish": "published a topic",
  "topic.reject": "rejected a topic",
  "topic.unpublish": "unpublished a topic",
  "topic.delete": "deleted a topic",
  "topic.archive": "archived a topic",
  "topic.edit": "edited a topic",
  "topic.reassign": "handed a topic to a new owner",
  "hearts.cutoff": "moved the ❤️ counting cutoff",
  "comment.hide": "hid a comment",
  "comment.unhide": "un-hid a comment",
  // Pinning by the topic's author (#258, 2026-08-17).
  "comment.pin": "pinned a comment",
  "comment.unpin": "unpinned a comment",
  "member.bio_edit": "edited a member's bio",
  "member.profile_edit": "updated their own profile",
  "heart.add": "❤️'d a topic",
  "heart.remove": "took back their ❤️ from a topic",
  // Host 💙s (2026-08-04) — logged since launch, unlabeled until the
  // 2026-08-17 log overhaul (they rendered as raw action names).
  "hostheart.add": "💙'd a topic",
  "hostheart.remove": "took back their 💙 from a topic",
  "comment.add": "commented on a topic",
  "comment.reply": "replied to a comment",
  "member.email_change": "changed a member's login email",
  "member.role_change": "changed a member's roles",
  "member.invite": "invited someone",
  "member.first_login": "signed in for the first time",
  "member.remove": "removed a member from the forum",
  "member.impersonate": "previewed the forum as a member",
  // Retained for historical rows; the preview-end event is no longer logged.
  "member.impersonate_end": "ended a member preview",
  "queue.finish": "finished their topic queue round",
  "forum.settings": "changed forum settings",
  "forum.privacy": "changed who can see the forum",
  "forum.slug": "changed the forum's URL",
  // Calendar v2 (QA 2026-08-03).
  "calendar.schedule": "added timeslots to the calendar",
  "slot.propose": "proposed a new session time",
  "slot.pencil": "pencilled a session into a timeslot",
  "slot.confirm": "confirmed a session",
  "slot.clear": "removed a pencilled session",
  "slot.edit": "edited a timeslot",
  "slot.delete": "deleted a timeslot",
  "slot.comment": "commented on a timeslot",
  "slot_comment.hide": "hid a timeslot comment",
  "slot_comment.unhide": "un-hid a timeslot comment",
  "availability.set": "answered availability for a timeslot",
  "availability.pattern": "updated their weekly availability pattern",
};

/** Timeline variants used when the event carries a named target member —
 * they end in a connective so the target chip completes the sentence:
 * "previewed the forum as <Jane> (Elector)". The generic ACTION_LABELS
 * remain the filter's wording and the fallback. */
export const TARGETED_LABELS: Record<string, string> = {
  "member.impersonate": "previewed the forum as",
  "member.bio_edit": "edited the bio of",
  "member.email_change": "changed the login email of",
  "member.role_change": "changed the roles of",
  "member.remove": "removed",
};

/** availability.set states → the emoji the calendar uses. */
export const AVAILABILITY_EMOJI: Record<string, string> = {
  green: "🟢",
  yellow: "🟡",
  red: "🔴",
};
