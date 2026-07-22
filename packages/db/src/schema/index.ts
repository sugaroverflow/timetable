export * from "./enums";
export * from "./auth";
export * from "./timetables";
export * from "./topics";
export * from "./calendar";
export * from "./rate-limits";

import { users } from "./auth";
import { apiRateLimitBuckets } from "./rate-limits";
import { availability, slotComments, slotTopics, timeslots } from "./calendar";
import {
  timetableInvites,
  timetableMemberships,
  timetables,
} from "./timetables";
import { activityEvents, comments, hearts, topics } from "./topics";

/** Convenience: inferred row types for the whole schema. */
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Timetable = typeof timetables.$inferSelect;
export type NewTimetable = typeof timetables.$inferInsert;

export type TimetableMembership = typeof timetableMemberships.$inferSelect;
export type NewTimetableMembership = typeof timetableMemberships.$inferInsert;

export type TimetableInvite = typeof timetableInvites.$inferSelect;
export type NewTimetableInvite = typeof timetableInvites.$inferInsert;

export type Topic = typeof topics.$inferSelect;
export type NewTopic = typeof topics.$inferInsert;
export type TopicStatus = Topic["status"];

export type Heart = typeof hearts.$inferSelect;
export type NewHeart = typeof hearts.$inferInsert;

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type CommentVisibility = Comment["visibility"];

export type ActivityEvent = typeof activityEvents.$inferSelect;
export type NewActivityEvent = typeof activityEvents.$inferInsert;

export type Timeslot = typeof timeslots.$inferSelect;
export type NewTimeslot = typeof timeslots.$inferInsert;

export type Availability = typeof availability.$inferSelect;
export type NewAvailability = typeof availability.$inferInsert;
export type AvailabilityState = Availability["state"];

export type SlotComment = typeof slotComments.$inferSelect;
export type NewSlotComment = typeof slotComments.$inferInsert;

export type SlotTopic = typeof slotTopics.$inferSelect;
export type NewSlotTopic = typeof slotTopics.$inferInsert;

export type ApiRateLimitBucket = typeof apiRateLimitBuckets.$inferSelect;
export type NewApiRateLimitBucket = typeof apiRateLimitBuckets.$inferInsert;
