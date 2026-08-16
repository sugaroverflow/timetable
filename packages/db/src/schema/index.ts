export * from "./enums";
export * from "./auth";
export * from "./timetables";
export * from "./topics";
export * from "./calendar";
export * from "./rate-limits";

import { apiTokens, users } from "./auth";
import {
  availability,
  availabilityPatterns,
  slotComments,
  slotSessions,
  timeslots,
} from "./calendar";
import { timetableMemberships, timetables } from "./timetables";
import { activityEvents, comments, hearts, hostHearts, topics } from "./topics";

/** Convenience: inferred row types for the whole schema. */
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type ApiToken = typeof apiTokens.$inferSelect;
export type NewApiToken = typeof apiTokens.$inferInsert;

export type Timetable = typeof timetables.$inferSelect;
export type NewTimetable = typeof timetables.$inferInsert;

export type TimetableMembership = typeof timetableMemberships.$inferSelect;
export type NewTimetableMembership = typeof timetableMemberships.$inferInsert;

export type Topic = typeof topics.$inferSelect;
export type NewTopic = typeof topics.$inferInsert;
export type TopicStatus = Topic["status"];

export type Heart = typeof hearts.$inferSelect;
export type NewHeart = typeof hearts.$inferInsert;

export type HostHeart = typeof hostHearts.$inferSelect;
export type NewHostHeart = typeof hostHearts.$inferInsert;

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type CommentVisibility = Comment["visibility"];

export type ActivityEvent = typeof activityEvents.$inferSelect;
export type NewActivityEvent = typeof activityEvents.$inferInsert;

export type Timeslot = typeof timeslots.$inferSelect;
export type NewTimeslot = typeof timeslots.$inferInsert;

export type SlotSession = typeof slotSessions.$inferSelect;
export type NewSlotSession = typeof slotSessions.$inferInsert;
export type SlotStatus = SlotSession["status"];

export type Availability = typeof availability.$inferSelect;
export type NewAvailability = typeof availability.$inferInsert;
export type AvailabilityState = Availability["state"];

export type NewAvailabilityPattern = typeof availabilityPatterns.$inferInsert;

export type SlotComment = typeof slotComments.$inferSelect;
export type NewSlotComment = typeof slotComments.$inferInsert;
