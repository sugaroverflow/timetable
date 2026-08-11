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

/** The digest's activity types, each individually switchable PER FORUM
 * (2026-08-11) — the digest is one email per forum, so each membership
 * carries its own switch set. One entry per thing a digest can carry;
 * list order is the settings card's display order. Round 2 (Ed's pruning
 * pass) added the ❤️/💙-follow kinds, host new-topics, @mentions, slot
 * releases, and new members — and REMOVED assignments and
 * your-topic-scheduled from the switchable set: an admin scheduling or
 * assigning something for you is an admin override you always hear
 * about. */
export const DIGEST_KINDS = [
  "comments",
  "draftingComments",
  "commentsHearted",
  "commentsHostHearted",
  "replies",
  "mentions",
  "hearts",
  "hostHearts",
  "sessions",
  "sessionsHostHearted",
  "availabilityAsks",
  "newTopics",
  "newTopicsHost",
  "pendingReview",
  "slotReleases",
  "drafts",
  "newMembers",
] as const;
export type DigestKind = (typeof DIGEST_KINDS)[number];

/** Per-kind defaults — what an untouched account receives when the forum
 * hasn't configured its own defaults either. All on. */
export const DIGEST_KIND_DEFAULTS: Record<DigestKind, boolean> = {
  comments: true,
  draftingComments: true,
  commentsHearted: true,
  commentsHostHearted: true,
  replies: true,
  mentions: true,
  hearts: true,
  hostHearts: true,
  sessions: true,
  sessionsHostHearted: true,
  availabilityAsks: true,
  newTopics: true,
  newTopicsHost: true,
  pendingReview: true,
  slotReleases: true,
  drafts: true,
  newMembers: true,
};

/** Which members a kind can ever fire for (2026-08-11): topic-owner and
 * calendar-claiming kinds are host business; ❤️-driven kinds are elector
 * business; the 💙 variants exist for hosts WITHOUT the elector role
 * (one-person-one-gesture: an elector-host's 💙 rolls into their ❤️);
 * newMembers is admin business; replies and mentions reach anyone. The
 * settings card hides inapplicable switches from non-admins and greys
 * them for admins. */
type DigestKindAudience =
  | "host"
  | "elector"
  | "hostNonElector"
  | "admin"
  | "all";

const KIND_AUDIENCE: Record<DigestKind, DigestKindAudience> = {
  comments: "host",
  draftingComments: "host",
  commentsHearted: "elector",
  commentsHostHearted: "hostNonElector",
  replies: "all",
  mentions: "all",
  hearts: "host",
  hostHearts: "host",
  sessions: "elector",
  sessionsHostHearted: "hostNonElector",
  availabilityAsks: "elector",
  newTopics: "elector",
  newTopicsHost: "hostNonElector",
  pendingReview: "admin",
  slotReleases: "host",
  drafts: "host",
  newMembers: "admin",
};

export function digestKindApplies(kind: DigestKind, roles: string[]): boolean {
  const host = roles.includes("host") || roles.includes("admin");
  const elector = roles.includes("elector");
  const admin = roles.includes("admin") || roles.includes("owner");
  const audience = KIND_AUDIENCE[kind];
  if (audience === "host") return host;
  if (audience === "elector") return elector;
  if (audience === "hostNonElector") return host && !elector;
  if (audience === "admin") return admin;
  return true;
}

/** The "([role] only)" scaffold admins see beside restricted switches —
 * temporary until the option set is final. */
export const DIGEST_KIND_ROLE_TAGS: Partial<Record<DigestKind, string>> = {
  comments: "host only",
  draftingComments: "host only",
  commentsHearted: "elector only",
  commentsHostHearted: "non-elector host only",
  hearts: "host only",
  hostHearts: "host only",
  sessions: "elector only",
  sessionsHostHearted: "non-elector host only",
  availabilityAsks: "elector only",
  newTopics: "elector only",
  newTopicsHost: "non-elector host only",
  pendingReview: "admin only",
  slotReleases: "host only",
  drafts: "host only",
  newMembers: "admin only",
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
  /** Sysadmins only: email when any new forum is created. */
  newForumEmails?: boolean;
};

/** A membership's per-forum digest switch set ({} = all defaults). */
export type DigestKinds = Partial<Record<DigestKind, boolean>>;

/** Whether one activity kind belongs in a forum's digest for this member:
 * the membership's own switch, else the FORUM's configured defaults
 * (2026-08-11 — admins set them in Forum Settings), else the global
 * all-on defaults. */
export function isDigestKindEnabled(
  kinds: DigestKinds | null | undefined,
  kind: DigestKind,
  forumDefaults?: DigestKinds | null,
): boolean {
  return kinds?.[kind] ?? forumDefaults?.[kind] ?? DIGEST_KIND_DEFAULTS[kind];
}

/** A membership's digest preferences (2026-08-11): the digest is one email
 * per forum, so EVERYTHING about it — on/off, cadence, and the kind
 * switches — is a per-forum choice. Absent fields fall back to the user's
 * stored global settings (the pre-per-forum layer, also where forum
 * defaults are seeded at join), then to daily/Monday. */
export type MembershipDigestSettings = {
  enabled?: boolean;
  frequency?: DigestFrequency;
  /** Weekly only: day to send on, 0 = Sunday … 6 = Saturday (UTC). */
  weekday?: number;
  kinds?: DigestKinds;
};

export type EffectiveDigestSettings = {
  enabled: boolean;
  frequency: DigestFrequency;
  weekday: number;
  kinds: DigestKinds;
};

/** Resolve one membership's effective digest settings: the membership's
 * own values, falling back to the user's global settings (which keeps
 * everyone's pre-per-forum behaviour without a data migration). */
export function effectiveDigestSettings(
  membership: MembershipDigestSettings | null | undefined,
  userFallback: NotificationSettings,
): EffectiveDigestSettings {
  return {
    enabled: membership?.enabled ?? isDigestEnabled(userFallback),
    frequency: membership?.frequency ?? userFallback.digestFrequency ?? "daily",
    weekday: membership?.weekday ?? userFallback.digestWeekday ?? 1,
    kinds: membership?.kinds ?? {},
  };
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
  /** Forum-level per-kind digest defaults (2026-08-11), configured in
   * Forum Settings — the layer between a member's own switches and the
   * global all-on defaults (see isDigestKindEnabled). */
  digestKindDefaults?: DigestKinds;
  /** Calendar feature (off unless enabled). */
  calendar?: CalendarSettings;
  /** Topic-lifecycle policy. */
  topics?: TopicSettings;
  /** Host-only comment thread option (on unless disabled). */
  hostComments?: HostCommentsSettings;
};
