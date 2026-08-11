/**
 * Settings shapes persisted as JSON by @timetable/db and rendered by the web
 * app. Single source of truth — db's jsonb columns and web's parsing/theming
 * helpers both import from here (the web copy used to be a hand-kept mirror).
 */

/** Custom display labels for the built-in roles. */
export type RoleLabels = {
  admin?: string;
  host?: string;
  elector?: string;
};

/** Per-user digest/notification preferences. Also used as per-timetable
 * digest defaults seeded onto new members who haven't customized theirs. */
export type DigestFrequency = "daily" | "weekly";

/** The digest's activity types, each individually switchable per user
 * (2026-08-11). One entry per thing a digest can carry. */
export const DIGEST_KINDS = [
  "comments",
  "replies",
  "hearts",
  "hostHearts",
  "sessions",
  "availabilityAsks",
  "newTopics",
  "assignments",
  "drafts",
] as const;
export type DigestKind = (typeof DIGEST_KINDS)[number];

/** Per-kind defaults — what an untouched account receives. Everything the
 * digest carried before per-kind switches existed stays on. */
export const DIGEST_KIND_DEFAULTS: Record<DigestKind, boolean> = {
  comments: true,
  replies: true,
  hearts: true,
  hostHearts: true,
  sessions: true,
  availabilityAsks: true,
  newTopics: true,
  assignments: true,
  drafts: true,
};

export type NotificationSettings = {
  /** Master switch (2026-07-29): off means no digest at all. */
  digestEnabled?: boolean;
  /** @deprecated Pre-2026-07-29 per-section flags, kept only so stored
   * settings still parse. Any of them true reads as enabled — use
   * `isDigestEnabled`, never these directly. */
  digestNewTopics?: boolean;
  /** @deprecated See digestNewTopics. */
  digestReplies?: boolean;
  /** @deprecated See digestNewTopics. */
  digestActivity?: boolean;
  /** How often digests arrive (2026-07-29): daily (the default) or
   * weekly on `digestWeekday`. */
  digestFrequency?: DigestFrequency;
  /** Weekly only: day to send on, 0 = Sunday … 6 = Saturday (UTC). */
  digestWeekday?: number;
  /** Per-kind switches (2026-08-11) — absent keys fall back to
   * DIGEST_KIND_DEFAULTS via `isDigestKindEnabled`. */
  digestKinds?: Partial<Record<DigestKind, boolean>>;
  /** Sysadmins only: email when any new forum is created. */
  newForumEmails?: boolean;
};

/** Whether one activity kind belongs in this user's digest. */
export function isDigestKindEnabled(
  settings: NotificationSettings,
  kind: DigestKind,
): boolean {
  return settings.digestKinds?.[kind] ?? DIGEST_KIND_DEFAULTS[kind];
}

/** Whether this user (or a forum's defaults) opt into digest emails. An
 * explicit `digestEnabled` wins; otherwise any legacy per-section flag
 * counts as opted in, so nobody subscribed before the switch loses their
 * digest. */
export function isDigestEnabled(settings: NotificationSettings): boolean {
  return (
    settings.digestEnabled ??
    Boolean(
      settings.digestNewTopics ||
      settings.digestReplies ||
      settings.digestActivity,
    )
  );
}

/** Canonical font-pairing keys (QA #59; expanded 2026-07-29). The API
 * validates against this list; the web app maps each key to label + CSS
 * stacks. One list so the two can't drift. */
export const THEME_FONT_KEYS = [
  "default",
  "editorial",
  "humanist",
  "modern",
  "technical",
  "elegant",
  "grotesk",
  "literary",
  "system",
  "newspeak",
] as const;

/** Canonical brand-font keys (2026-07-29): the display face for the forum
 * name in the topbar, independent of the reading-font pairing. */
export const BRAND_FONT_KEYS = [
  "default",
  "fraunces",
  "playfair",
  "abril",
  "bebas",
  "grotesk",
  "lobster",
  "caveat",
  "mono",
  "sans",
] as const;

/** Per-timetable theme (QA #59 full theming). All colours are #rrggbb.
 * `dark` overrides apply when the viewer uses dark mode; unset dark values
 * fall back to the built-in dark palette. `font` picks a curated pairing;
 * `brandFont` sets the topbar forum-name face separately. */
export type ThemeSettings = {
  primary?: string;
  secondary?: string;
  background?: string;
  topbar?: string;
  topbarText?: string;
  text?: string;
  font?: string;
  brandFont?: string;
  dark?: {
    primary?: string;
    secondary?: string;
    background?: string;
    topbar?: string;
    topbarText?: string;
    text?: string;
  };
};

/** Who may pencil/confirm sessions into timeslots (calendar v2):
 * - admins: hosts discuss only; admins set topic/status
 * - hosts_propose (default): hosts pencil their own topic onto an empty slot
 *   and create off-piste proposed slots; confirming needs an admin
 * - hosts_confirm: full self-service (unconference mode); admins keep
 *   override. A host can only ever act on their own topic and never
 *   displace another host's — that invariant holds at every level. */
export const CONFIRM_POLICIES = [
  "admins",
  "hosts_propose",
  "hosts_confirm",
] as const;
export type ConfirmPolicy = (typeof CONFIRM_POLICIES)[number];

/** One weekly time cell of the forum's slot pattern. `weekday` uses
 * Date.getDay numbering (0=Sun…6=Sat); times are "HH:MM" on the forum's
 * local clock. The cell key "{weekday}-{start}" links generated slots and
 * elector pattern answers back to it. */
export type CalendarPatternCell = {
  weekday: number;
  start: string;
  end: string;
  /** Locations open in this cell (slot locations, 2026-08-11) — generated
   * slots carry them. Absent on cells from before locations were required,
   * and in forums with no configured locations. */
  locations?: string[];
};

export function patternCellKey(cell: {
  weekday: number;
  start: string;
}): string {
  return `${cell.weekday}-${cell.start}`;
}

/** The forum's label for topic-less host sessions. */
export function officeHoursLabel(settings: TimetableSettings): string {
  return settings.calendar?.officeHoursLabel?.trim() || "Office hours";
}

/** A named date range slots are generated for (a term, or an event
 * weekend). Dates are inclusive "YYYY-MM-DD". */
export type CalendarTerm = {
  name: string;
  start: string;
  end: string;
};

/** The Calendar feature's per-forum settings (user-facing name "Calendar";
 * this key avoids colliding with the timetable-means-forum internal naming).
 * `enabled` defaults off — the whole feature (nav link, page, API surface,
 * ICS) sits behind it. Toggling off hides, never deletes. */
export type CalendarSettings = {
  enabled?: boolean;
  confirmPolicy?: ConfirmPolicy;
  /** Display label for topic-less host sessions (QA 2026-08-03) —
   * "Office hours" by default; a fixed type label, never free text per
   * session, so the topic discipline holds. */
  officeHoursLabel?: string;
  /** Preset locations offered when creating/proposing slots (free text
   * stays allowed). */
  locations?: string[];
  /** The weekly pattern slots are generated from — also exactly the grid
   * electors paint their availability on. */
  patternCells?: CalendarPatternCell[];
  /** Date ranges the pattern applies to; pattern × terms = the slot grid. */
  terms?: CalendarTerm[];
};

/** Topic-lifecycle settings: whether hosts publish their own topics
 * directly (admin review becomes after-the-fact oversight) or submit for
 * review (the default). */
export type TopicSettings = {
  hostsPublishDirectly?: boolean;
};

/** The host-only comment thread as a forum option (host 💙s, 2026-08-04):
 * on by default; forums where every host is also an elector can switch the
 * faculty backchannel off. Toggling off hides the thread and the 💙
 * attribution row — nothing is deleted, and host 💙s keep working as a
 * private bookmark (visible only in admin analysis). */
export type HostCommentsSettings = {
  enabled?: boolean;
};

/** Whether the forum shows the host-only comment thread (and with it the
 * attributed 💙 row + 💙s in host digests). Defaults ON. */
export function isHostCommentsEnabled(settings: TimetableSettings): boolean {
  return settings.hostComments?.enabled ?? true;
}

/** Per-timetable settings persisted as JSON: custom role labels, theme
 * colors, default digest options, etc. */
export type TimetableSettings = {
  roleLabels?: RoleLabels;
  theme?: ThemeSettings;
  coverImageUrl?: string | null;
  /** Small square icon shown in the topbar timetable menu. */
  iconUrl?: string | null;
  /** Optional dark-mode alternative for iconUrl (2026-07-29) — shown when
   * the viewer's resolved theme is dark; falls back to iconUrl unset. */
  iconDarkUrl?: string | null;
  /** Emoji shown as the icon instead of an uploaded image (takes precedence). */
  iconEmoji?: string | null;
  /** Digest settings seeded onto new members who haven't customized theirs. */
  digestDefaults?: NotificationSettings;
  /** Calendar feature (off unless enabled). */
  calendar?: CalendarSettings;
  /** Topic-lifecycle policy. */
  topics?: TopicSettings;
  /** Host-only comment thread option (on unless disabled). */
  hostComments?: HostCommentsSettings;
};
