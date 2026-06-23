export * from "./enums";
export * from "./auth";
export * from "./timetables";

import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "./auth";
import {
  timetableInvites,
  timetableMemberships,
  timetables,
} from "./timetables";

/** Convenience: inferred row types for the whole schema. */
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type VerificationToken = typeof verificationTokens.$inferSelect;

export type Timetable = typeof timetables.$inferSelect;
export type NewTimetable = typeof timetables.$inferInsert;

export type TimetableMembership = typeof timetableMemberships.$inferSelect;
export type NewTimetableMembership = typeof timetableMemberships.$inferInsert;

export type TimetableInvite = typeof timetableInvites.$inferSelect;
export type NewTimetableInvite = typeof timetableInvites.$inferInsert;
