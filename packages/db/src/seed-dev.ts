import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import { config } from "dotenv";
import { and, eq, ne, sql as drizzleSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";
import {
  activityEvents,
  availability,
  availabilityPatterns,
  comments,
  hearts,
  hostHearts,
  slotComments,
  slotSessions,
  timetableMemberships,
  timetables,
  timeslots,
  topics,
  users,
  type AvailabilityState,
  type CommentVisibility,
  type NewActivityEvent,
  type NewAvailability,
  type NewAvailabilityPattern,
  type NewComment,
  type NewHeart,
  type NewHostHeart,
  type NewSlotComment,
  type NewSlotSession,
  type NewTimetable,
  type NewTimetableMembership,
  type NewTopic,
  type NewTimeslot,
  type NewUser,
  type SlotStatus,
  type TopicStatus,
} from "./schema";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const repoRootUrl = new URL("../../../", import.meta.url);
const sampleFileCandidates = [
  new URL("dev-sample-data.md", repoRootUrl),
  new URL("docs/dev-sample-data.md", repoRootUrl),
];

const ROLE_VALUES = ["owner", "admin", "host", "elector"] as const;
export type Role = (typeof ROLE_VALUES)[number];

const TOPIC_STATUS_VALUES = [
  "submitted",
  "published",
  "unpublished",
  "archived",
] as const satisfies readonly TopicStatus[];

const COMMENT_VISIBILITY_VALUES = [
  "public",
  "host_only",
  "admin_only",
] as const satisfies readonly CommentVisibility[];

const TIMETABLE_PRIVACY_VALUES = [
  "deactivated",
  "private",
  "public",
  "hosts_only",
  "no_comments",
] as const;
type TimetablePrivacy = (typeof TIMETABLE_PRIVACY_VALUES)[number];

const AVAILABILITY_STATE_VALUES = [
  "green",
  "yellow",
  "red",
] as const satisfies readonly AvailabilityState[];

type SlotAvailability = { person: string; state: AvailabilityState };
type SlotDiscussionEntry = {
  author: string;
  text: string;
  /** Session claim (calendar v2): "I'd like this slot for <topic>", with the
   * frozen 🟢🟡🔴 snapshot the author saw when posting. */
  claimTopic: string | null;
  claimCounts: { green: number; yellow: number; red: number } | null;
};

type SlotFixture = {
  label: string;
  date: string; // YYYY-MM-DD (already resolved from any relative form)
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  location: string;
  /** The slot's session topic (calendar v2: one topic per slot; the first
   * listed tag wins if a fixture still lists several). */
  topicTags: string[];
  /** Office-hours session (QA 2026-08-03): the session's subject is this
   * host, not a topic. Mutually exclusive with topicTags. */
  sessionHost: string | null;
  /** Session status; defaults to proposed when a session is set, empty
   * otherwise. */
  status: SlotStatus | null;
  /** Off-piste slot (host proposal outside the weekly pattern): no cellKey,
   * excluded from the derived forum pattern/term/locations. */
  offGrid: boolean;
  url: string;
  availability: SlotAvailability[];
  discussion: SlotDiscussionEntry[];
};

/**
 * Seed times are RELATIVE to the seed run (2026-08-03): fixed dates left the
 * feed, digests, and calendar looking dead the day after they were written.
 * Anchored to `SEED_NOW`, every reseed yields recent comments/❤️s (inside
 * the digest's 24h window), a calendar with past + upcoming weeks, and
 * sessions inside the digest's 14-day horizon — on any day, forever.
 */
const SEED_NOW = new Date();
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function hoursAgo(hours: number): Date {
  return new Date(SEED_NOW.getTime() - hours * HOUR_MS);
}

/** The i-th of `count` moments spread evenly across a window ending before
 * SEED_NOW — monotonic in `i`, and never in the future however large the
 * fixture grows. */
function spreadTime(
  windowStartHoursAgo: number,
  windowEndHoursAgo: number,
  index: number,
  count: number,
): Date {
  const start = SEED_NOW.getTime() - windowStartHoursAgo * HOUR_MS;
  const end = SEED_NOW.getTime() - windowEndHoursAgo * HOUR_MS;
  const step = count > 1 ? (end - start) / (count - 1) : 0;
  return new Date(start + step * index);
}

const BASE_TIME = hoursAgo(60 * 24); // memberships, slots, patterns
const TOPIC_TIME = hoursAgo(50 * 24); // topic createdAt stagger
const COMMENT_WINDOW = [42, 1] as const; // comments: last ~2 days
const HEART_WINDOW = [4, 1] as const; // ❤️s: all inside the digest day
const ACTIVITY_WINDOW = [20, 2] as const; // activity log: last day
/** "Published date, if published: recent" resolves here — inside the digest
 * window, so the topic surfaces as a "New" card for electors. */
const RECENT_PUBLISH_TIME = hoursAgo(6);
/** Slot updatedAt: recent, so seeded sessions count as news ("New" pill) in
 * the first digest run after seeding — stale sessions never trigger email. */
const SLOT_UPDATED_TIME = hoursAgo(3);
const RESET_DATABASE_TABLES = [
  "api_rate_limit_buckets",
  "activity_events",
  "slot_comments",
  "availability",
  "availability_patterns",
  "slot_sessions",
  "timeslots",
  "comments",
  "hearts",
  "host_hearts",
  "topics",
  "timetable_invites",
  "timetable_memberships",
  "timetables",
  "user",
];

type RoleLabels = NonNullable<NewTimetable["settings"]>["roleLabels"];

type TimetableFixture = {
  name: string;
  slug: string;
  privacy: TimetablePrivacy;
  roleLabels: RoleLabels;
};

export type PersonFixture = {
  label: string;
  displayName: string;
  roles: Role[];
  bio: string | null;
  /** Real Clerk user ID — when set, used directly as the local user ID so this person can sign in with their actual Clerk account. */
  clerkId: string | null;
};

type TopicFixture = {
  label: string;
  title: string;
  host: string;
  status: TopicStatus;
  publishedAt: Date | null;
  coverImageUrl: string | null;
  /** "Recently assigned: yes" seeds a fresh topic.reassign activity event,
   * so the host's digest shows an "Assigned to you" card. */
  recentlyAssigned: boolean;
  bodyMd: string;
};

type CommentFixture = {
  label: string;
  topic: string;
  author: string;
  visibility: CommentVisibility;
  replyTo: string | null;
  hidden: boolean;
  text: string;
};

type HeartsFixture = {
  topic: string;
  people: string[];
};

export type Fixture = {
  timetable: TimetableFixture;
  people: PersonFixture[];
  topics: TopicFixture[];
  comments: CommentFixture[];
  hearts: HeartsFixture[];
  /** 💙s from host-non-electors (host hearts, 2026-08-04). */
  hostHearts: HeartsFixture[];
  slots: SlotFixture[];
};

function hasValue<T extends string>(
  values: readonly T[],
  value: string,
): value is T {
  return values.includes(value as T);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function shouldResetDevDatabase(): boolean {
  return (
    process.env.SEED_DEV_RESET_DATABASE === "true" ||
    process.argv.includes("--reset-dev-database")
  );
}

function resetDatabaseSql(): string {
  const tables = RESET_DATABASE_TABLES.map((table) => `"${table}"`).join(", ");
  return `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`;
}

export function stableUuid(scope: string, key: string): string {
  const hash = createHash("sha1")
    .update(`timetable-dev-seed:${scope}:${key}`)
    .digest();

  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;

  const hex = hash.subarray(0, 16).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function userIdFor(label: string): string {
  return `dev_sample_${label.replace(/[^a-z0-9_-]/gi, "_")}`;
}

export function fakeEmailFor(label: string): string {
  return `${label.toLowerCase()}+clerk_test@example.com`;
}

function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, "");
}

function section(markdown: string, heading: string): string {
  const startPattern = new RegExp(`^## ${escapeRegExp(heading)}[ \\t]*$`, "m");
  const startMatch = startPattern.exec(markdown);
  if (!startMatch || startMatch.index === undefined) {
    throw new Error(`Missing "## ${heading}" section in sample data`);
  }

  const contentStart = startMatch.index + startMatch[0].length;
  const rest = markdown.slice(contentStart);
  const nextMatch = /^## /m.exec(rest);
  return (nextMatch ? rest.slice(0, nextMatch.index) : rest).trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fieldFromBlock(
  block: string,
  name: string,
  opts: { required?: boolean } = {},
): string {
  const match = new RegExp(`^${escapeRegExp(name)}:[ \\t]*(.*)$`, "m").exec(
    block,
  );
  const value = match?.[1]?.trim() ?? "";
  if (opts.required && !value) {
    throw new Error(`Missing required field "${name}" in sample data`);
  }
  return value;
}

function markdownTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseTimetable(markdown: string): TimetableFixture {
  const block = section(markdown, "Timetable");
  const name = fieldFromBlock(block, "Name", { required: true });
  const slug = fieldFromBlock(block, "Slug", { required: true });
  const privacyRaw = fieldFromBlock(block, "Privacy", { required: true });
  const privacy =
    /\*\*(deactivated|private|public|hosts_only|no_comments)\*\*/.exec(
      privacyRaw,
    )?.[1] ?? privacyRaw.trim();

  if (!hasValue(TIMETABLE_PRIVACY_VALUES, privacy)) {
    throw new Error(
      `Invalid timetable privacy "${privacyRaw}". Valid values: ${TIMETABLE_PRIVACY_VALUES.join(", ")}`,
    );
  }

  const roleLabels: RoleLabels = {};
  for (const match of block.matchAll(
    /^- (Admin|Host|Elector):[ \t]*(.+)$/gim,
  )) {
    const role = match[1]?.toLowerCase() as keyof NonNullable<RoleLabels>;
    const label = match[2]?.trim();
    if (role && label) roleLabels[role] = label;
  }

  return { name, slug, privacy, roleLabels };
}

function parseRoles(rolesRaw: string, label: string): Role[] {
  const roles: Role[] = [];
  for (const role of rolesRaw.split(",").map((value) => value.trim())) {
    if (!hasValue(ROLE_VALUES, role)) {
      throw new Error(
        `Invalid role "${role}" for person "${label}". Valid roles: ${ROLE_VALUES.join(", ")}`,
      );
    }
    roles.push(role);
  }
  return roles;
}

function parsePersonRow(line: string): PersonFixture {
  const [label, displayName, rolesRaw, bioRaw, clerkIdRaw] =
    markdownTableCells(line);
  if (!label || !displayName || !rolesRaw) {
    throw new Error(`Invalid person row: ${line}`);
  }

  return {
    label,
    displayName,
    roles: parseRoles(rolesRaw, label),
    bio: bioRaw?.trim() || null,
    clerkId: clerkIdRaw?.trim() || null,
  };
}

function parsePeople(markdown: string): PersonFixture[] {
  const block = section(markdown, "People");
  const people: PersonFixture[] = [];

  for (const line of block.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    if (
      line.includes("---") ||
      line.includes("Person label") ||
      line.includes("Clerk ID")
    )
      continue;

    people.push(parsePersonRow(line));
  }

  if (people.length === 0) {
    throw new Error("No people found in sample data");
  }

  return people;
}

function parseTopicDate(value: string, label: string): Date | null {
  if (!value) return null;
  // "recent" = a few hours before the seed run — inside the digest window,
  // so the topic shows up as a "New" card in the next digest.
  if (value === "recent") return RECENT_PUBLISH_TIME;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(
      `Invalid published date "${value}" for topic "${label}". Use YYYY-MM-DD or "recent".`,
    );
  }
  return new Date(`${value}T12:00:00.000Z`);
}

function parseYesNo(value: string, field: string, label: string): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  if (["yes", "true"].includes(normalized)) return true;
  if (["no", "false"].includes(normalized)) return false;
  throw new Error(
    `Invalid ${field} value "${value}" for "${label}". Use yes or no.`,
  );
}

function parseTopics(markdown: string): TopicFixture[] {
  const block = section(markdown, "Topics");
  const topicBlocks = block.split(/^### Topic:\s*/m).slice(1);
  const parsed: TopicFixture[] = [];

  for (const topicBlock of topicBlocks) {
    const { label, rest } = splitLabeledBlock(topicBlock);

    if (!label) throw new Error("Found topic section without a label");

    const bodyMatch = /^Body:[ \t]*$/m.exec(rest);
    if (!bodyMatch || bodyMatch.index === undefined) {
      throw new Error(`Topic "${label}" is missing a Body field`);
    }

    const fields = rest.slice(0, bodyMatch.index);
    const bodyStart = bodyMatch.index + bodyMatch[0].length;
    const bodyMd = rest.slice(bodyStart).trim();
    const title = fieldFromBlock(fields, "Title", { required: true });
    const host = fieldFromBlock(fields, "Host", { required: true });
    const statusRaw = fieldFromBlock(fields, "Status", { required: true });
    // Draft removed (product feedback round 1): legacy "draft" fixtures seed
    // as "submitted" (the new created/publishable state).
    const status = statusRaw === "draft" ? "submitted" : statusRaw;

    if (!hasValue(TOPIC_STATUS_VALUES, status)) {
      throw new Error(
        `Invalid status "${statusRaw}" for topic "${label}". Valid statuses: ${TOPIC_STATUS_VALUES.join(", ")}`,
      );
    }

    parsed.push({
      label,
      title,
      host,
      status,
      publishedAt: parseTopicDate(
        fieldFromBlock(fields, "Published date, if published"),
        label,
      ),
      coverImageUrl: fieldFromBlock(fields, "Cover image URL, if any") || null,
      recentlyAssigned: parseYesNo(
        fieldFromBlock(fields, "Recently assigned"),
        "Recently assigned",
        label,
      ),
      bodyMd,
    });
  }

  if (parsed.length === 0) {
    throw new Error("No topics found in sample data");
  }

  return parsed;
}

function visibilityFromText(value: string, label: string): CommentVisibility {
  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  if (normalized === "hosts_only") return "host_only";
  if (normalized === "admins_only") return "admin_only";
  if (hasValue(COMMENT_VISIBILITY_VALUES, normalized)) return normalized;
  throw new Error(
    `Invalid visibility "${value}" for comment "${label}". Valid values: public, hosts only, admins only`,
  );
}

function commentFromFields(fields: Record<string, string>): CommentFixture {
  const topic = fields["Topic"];
  const label = fields["Comment id"];
  const author = fields["Author"];
  const visibility = fields["Visibility"];
  const text = fields["Text"];

  if (!topic || !label || !author || !visibility || !text) {
    throw new Error(
      `Comment is missing one of Topic, Comment id, Author, Visibility, or Text: ${JSON.stringify(fields)}`,
    );
  }

  return {
    label,
    topic,
    author,
    visibility: visibilityFromText(visibility, label),
    replyTo: fields["Reply to"] || null,
    hidden: parseYesNo(fields["Hidden"] ?? "", "Hidden", label),
    text,
  };
}

/** Apply an indented "  Key: value" or Text-continuation line to the comment
 * being parsed. Returns whether following lines may still continue Text. */
function applyCommentBodyLine(
  current: Record<string, string>,
  line: string,
  textContinuation: boolean,
): boolean {
  const fieldMatch = /^ {2}([^:]+):\s*(.*)$/.exec(line);
  if (fieldMatch) {
    const key = fieldMatch[1]?.trim() ?? "";
    current[key] = fieldMatch[2]?.trim() ?? "";
    return key === "Text";
  }

  if (textContinuation && line.startsWith("  ")) {
    current["Text"] = `${current["Text"] ?? ""}\n${line.trim()}`;
  }
  return textContinuation;
}

function parseComments(markdown: string): CommentFixture[] {
  const block = section(markdown, "Comments");
  const commentsFixture: CommentFixture[] = [];
  let current: Record<string, string> | null = null;
  let currentTextContinuation = false;

  for (const rawLine of block.split("\n")) {
    const line = rawLine.trimEnd();
    const topicMatch = /^- Topic:\s*(.+)$/.exec(line);
    if (topicMatch) {
      if (current) commentsFixture.push(commentFromFields(current));
      current = { Topic: topicMatch[1]?.trim() ?? "" };
      currentTextContinuation = false;
      continue;
    }

    if (!current) continue;

    currentTextContinuation = applyCommentBodyLine(
      current,
      line,
      currentTextContinuation,
    );
  }

  if (current) commentsFixture.push(commentFromFields(current));
  return commentsFixture;
}

function parseHearts(markdown: string): HeartsFixture[] {
  const block = section(markdown, "Hearts");
  const parsed: HeartsFixture[] = [];

  for (const line of block.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    if (line.includes("---") || line.includes("People who hearted it")) {
      continue;
    }

    const [topic, peopleRaw] = markdownTableCells(line);
    if (!topic) throw new Error(`Invalid hearts row: ${line}`);

    parsed.push({
      topic,
      people: peopleRaw
        ? peopleRaw
            .split(",")
            .map((person) => person.trim())
            .filter(Boolean)
        : [],
    });
  }

  return parsed;
}

/** 💙 rows (host hearts, 2026-08-04): same table shape as Hearts, in a
 * "## Host hearts" section. */
function parseHostHearts(markdown: string): HeartsFixture[] {
  const block = section(markdown, "Host hearts");
  const parsed: HeartsFixture[] = [];

  for (const line of block.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    if (line.includes("---") || line.includes("who 💙'd it")) {
      continue;
    }

    const [topic, peopleRaw] = markdownTableCells(line);
    if (!topic) throw new Error(`Invalid host hearts row: ${line}`);

    parsed.push({
      topic,
      people: peopleRaw
        ? peopleRaw
            .split(",")
            .map((person) => person.trim())
            .filter(Boolean)
        : [],
    });
  }

  return parsed;
}

/** Split a "### Something: <label>" block into its label line and body. */
function splitLabeledBlock(block: string): { label: string; rest: string } {
  const firstNewline = block.indexOf("\n");
  const label =
    firstNewline === -1 ? block.trim() : block.slice(0, firstNewline).trim();
  const rest = firstNewline === -1 ? "" : block.slice(firstNewline + 1);
  return { label, rest };
}

function parseAvailabilityRow(
  line: string,
  label: string,
): SlotAvailability | null {
  if (!line.trim().startsWith("|")) return null;
  if (
    line.includes("---") ||
    line.toLowerCase().includes("person label") ||
    line.toLowerCase().includes("state")
  )
    return null;
  const cells = markdownTableCells(line);
  const person = cells[0]?.trim();
  const stateRaw = cells[1]?.trim().toLowerCase() ?? "";
  if (!person) return null;
  if (!hasValue(AVAILABILITY_STATE_VALUES, stateRaw)) {
    throw new Error(
      `Invalid availability state "${stateRaw}" for slot "${label}"`,
    );
  }
  return { person, state: stateRaw };
}

/** Parse a slot's Availability table. */
function parseSlotAvailability(
  rest: string,
  label: string,
): SlotAvailability[] {
  // \Z (PCRE end-of-string) doesn't exist in JS regexes — it matched a
  // literal "Z". $(?![\s\S]) is the real end-of-input anchor.
  const availMatch =
    /^Availability:\s*$([\s\S]*?)(?=^(?:Discussion:|###)|$(?![\s\S]))/m.exec(
      rest,
    );
  if (!availMatch) return [];

  const entries: SlotAvailability[] = [];
  for (const line of availMatch[1]!.split("\n")) {
    const entry = parseAvailabilityRow(line, label);
    if (entry) entries.push(entry);
  }
  return entries;
}

/** Apply a "  Text:"/"  Claim:"/"  Counts:" or continuation line to the
 * discussion entry. Claim + Counts turn the comment into a session claim
 * ("I'd like this slot for <topic> · 4🟢 8🟡 2🔴" — counts deliberately
 * frozen, as in the live feature). */
function applyDiscussionLine(current: SlotDiscussionEntry, line: string): void {
  const textMatch = /^ {2}Text:\s*(.*)$/.exec(line);
  if (textMatch) {
    current.text = textMatch[1]?.trim() ?? "";
    return;
  }
  const claimMatch = /^ {2}Claim:\s*(\S+)\s*$/.exec(line);
  if (claimMatch) {
    current.claimTopic = claimMatch[1]!;
    return;
  }
  const countsMatch =
    /^ {2}Counts:\s*(\d+)\s+green,\s*(\d+)\s+yellow,\s*(\d+)\s+red\s*$/.exec(
      line,
    );
  if (countsMatch) {
    current.claimCounts = {
      green: Number(countsMatch[1]),
      yellow: Number(countsMatch[2]),
      red: Number(countsMatch[3]),
    };
    return;
  }
  if (line.startsWith("  ") && line.trim()) {
    current.text = current.text
      ? `${current.text}\n${line.trim()}`
      : line.trim();
  }
}

/** Parse a slot's Discussion list — rest is already isolated to one slot
 * block, so capture greedily to end of block (\Z is not valid in JS regex). */
function parseSlotDiscussion(rest: string): SlotDiscussionEntry[] {
  const discussMatch = /^Discussion:\s*$([\s\S]*)/m.exec(rest);
  if (!discussMatch) return [];

  const discussion: SlotDiscussionEntry[] = [];
  let current: SlotDiscussionEntry | null = null;
  for (const rawLine of discussMatch[1]!.split("\n")) {
    const line = rawLine.trimEnd();
    const authorMatch = /^- Author:\s*(.+)$/.exec(line);
    if (authorMatch) {
      if (current) discussion.push(current);
      current = {
        author: authorMatch[1]!.trim(),
        text: "",
        claimTopic: null,
        claimCounts: null,
      };
      continue;
    }
    if (current) applyDiscussionLine(current, line);
  }
  if (current) discussion.push(current);
  return discussion;
}

function parseSlotBlock(slotBlock: string): SlotFixture {
  const { label, rest } = splitLabeledBlock(slotBlock);
  if (!label) throw new Error("Found slot section without a label");

  const date = resolveSlotDate(
    fieldFromBlock(rest, "Date", { required: true }),
    label,
  );
  const startTime = fieldFromBlock(rest, "Start", { required: true });
  const endTime = fieldFromBlock(rest, "End", { required: true });
  const location = fieldFromBlock(rest, "Location", { required: true });
  const topicsRaw = fieldFromBlock(rest, "Topics");
  const topicTags = topicsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const statusRaw = fieldFromBlock(rest, "Status").trim();
  if (statusRaw && statusRaw !== "proposed" && statusRaw !== "confirmed") {
    throw new Error(`Invalid slot status "${statusRaw}" for slot "${label}"`);
  }

  return {
    label,
    date,
    startTime,
    endTime,
    location,
    topicTags,
    sessionHost: fieldFromBlock(rest, "Session host").trim() || null,
    status: (statusRaw as SlotStatus) || null,
    offGrid: parseYesNo(fieldFromBlock(rest, "Off-grid"), "Off-grid", label),
    url: fieldFromBlock(rest, "Url").trim(),
    availability: parseSlotAvailability(rest, label),
    discussion: parseSlotDiscussion(rest),
  };
}

function parseSlots(markdown: string): SlotFixture[] {
  let block: string;
  try {
    block = section(markdown, "Timeslots");
  } catch {
    return [];
  }

  return block
    .split(/^### Slot:\s*/m)
    .slice(1)
    .map((slotBlock) => parseSlotBlock(slotBlock));
}

function assertUnique<T>(
  values: T[],
  getKey: (value: T) => string,
  label: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    const key = getKey(value);
    if (seen.has(key)) throw new Error(`Duplicate ${label} "${key}"`);
    seen.add(key);
  }
}

function validateTopics(
  fixtureTopics: TopicFixture[],
  peopleByLabel: Map<string, PersonFixture>,
): void {
  for (const topic of fixtureTopics) {
    const host = peopleByLabel.get(topic.host);
    if (!host) {
      throw new Error(
        `Topic "${topic.label}" refers to missing host "${topic.host}"`,
      );
    }
    if (!host.roles.includes("host")) {
      throw new Error(
        `Topic "${topic.label}" host "${topic.host}" does not have the host role`,
      );
    }
  }
}

function validateComments(
  fixtureComments: CommentFixture[],
  topicsByLabel: Map<string, TopicFixture>,
  peopleByLabel: Map<string, PersonFixture>,
  commentsByLabel: Map<string, CommentFixture>,
): void {
  for (const comment of fixtureComments) {
    if (!topicsByLabel.has(comment.topic)) {
      throw new Error(
        `Comment "${comment.label}" refers to missing topic "${comment.topic}"`,
      );
    }
    if (!peopleByLabel.has(comment.author)) {
      throw new Error(
        `Comment "${comment.label}" refers to missing author "${comment.author}"`,
      );
    }
    if (comment.replyTo) {
      const parent = commentsByLabel.get(comment.replyTo);
      if (!parent) {
        throw new Error(
          `Comment "${comment.label}" replies to missing comment "${comment.replyTo}"`,
        );
      }
      if (parent.topic !== comment.topic) {
        throw new Error(
          `Comment "${comment.label}" replies to "${comment.replyTo}" on a different topic`,
        );
      }
    }
  }
}

function validateHeartPeople(
  row: HeartsFixture,
  peopleByLabel: Map<string, PersonFixture>,
  seenHearts: Set<string>,
): void {
  for (const personLabel of row.people) {
    const person = peopleByLabel.get(personLabel);
    if (!person) {
      throw new Error(
        `Hearts row for topic "${row.topic}" refers to missing person "${personLabel}"`,
      );
    }
    if (!person.roles.includes("elector")) {
      throw new Error(
        `Hearts row for topic "${row.topic}" refers to "${personLabel}", who does not have the elector role`,
      );
    }

    const key = `${row.topic}:${personLabel}`;
    if (seenHearts.has(key)) {
      throw new Error(
        `Duplicate heart for topic "${row.topic}" and person "${personLabel}"`,
      );
    }
    seenHearts.add(key);
  }
}

function validateHearts(
  fixtureHearts: HeartsFixture[],
  topicsByLabel: Map<string, TopicFixture>,
  peopleByLabel: Map<string, PersonFixture>,
): void {
  const seenHearts = new Set<string>();
  for (const row of fixtureHearts) {
    const topic = topicsByLabel.get(row.topic);
    if (!topic) {
      throw new Error(`Hearts row refers to missing topic "${row.topic}"`);
    }
    if (!["published", "archived"].includes(topic.status)) {
      throw new Error(
        `Hearts row for topic "${row.topic}" targets a ${topic.status} topic; only published or archived topics should be hearted`,
      );
    }

    validateHeartPeople(row, peopleByLabel, seenHearts);
  }
}

/** 💙 rows must come from people who could 💙 in the app: host role and
 * NOT elector (a dual-role member's ❤️ is their gesture — canHostHeart). */
function validateHostHeartPeople(
  row: HeartsFixture,
  peopleByLabel: Map<string, PersonFixture>,
  seen: Set<string>,
): void {
  for (const personLabel of row.people) {
    const person = peopleByLabel.get(personLabel);
    if (!person) {
      throw new Error(
        `Host hearts row for topic "${row.topic}" refers to missing person "${personLabel}"`,
      );
    }
    if (!person.roles.includes("host") || person.roles.includes("elector")) {
      throw new Error(
        `Host hearts row for topic "${row.topic}" refers to "${personLabel}" — 💙s come from people with the host role and WITHOUT the elector role`,
      );
    }
    const key = `${row.topic}:${personLabel}`;
    if (seen.has(key)) {
      throw new Error(
        `Duplicate 💙 for topic "${row.topic}" and person "${personLabel}"`,
      );
    }
    seen.add(key);
  }
}

function validateHostHearts(
  fixtureHostHearts: HeartsFixture[],
  topicsByLabel: Map<string, TopicFixture>,
  peopleByLabel: Map<string, PersonFixture>,
): void {
  const seen = new Set<string>();
  for (const row of fixtureHostHearts) {
    const topic = topicsByLabel.get(row.topic);
    if (!topic) {
      throw new Error(`Host hearts row refers to missing topic "${row.topic}"`);
    }
    if (!["published", "archived"].includes(topic.status)) {
      throw new Error(
        `Host hearts row for topic "${row.topic}" targets a ${topic.status} topic; only published or archived topics should be 💙'd`,
      );
    }
    validateHostHeartPeople(row, peopleByLabel, seen);
  }
}

function validateSlotSession(
  slot: SlotFixture,
  topicsByLabel: Map<string, TopicFixture>,
  peopleByLabel: Map<string, PersonFixture>,
): void {
  for (const tag of slot.topicTags) {
    if (!topicsByLabel.has(tag))
      throw new Error(`Slot "${slot.label}" references missing topic "${tag}"`);
  }
  if (!slot.sessionHost) return;
  if (slot.topicTags.length > 0) {
    throw new Error(
      `Slot "${slot.label}" has both Topics and Session host — an office-hours session has no topic`,
    );
  }
  const host = peopleByLabel.get(slot.sessionHost);
  if (!host || !host.roles.includes("host")) {
    throw new Error(
      `Slot "${slot.label}" session host "${slot.sessionHost}" is not a person with the host role`,
    );
  }
}

function validateSlotAvailability(
  slot: SlotFixture,
  peopleByLabel: Map<string, PersonFixture>,
): void {
  for (const av of slot.availability) {
    const p = peopleByLabel.get(av.person);
    if (!p)
      throw new Error(
        `Slot "${slot.label}" availability references missing person "${av.person}"`,
      );
    const recognised = (["elector", "host", "admin", "owner"] as const).some(
      (role) => p.roles.includes(role),
    );
    if (!recognised) {
      throw new Error(
        `Slot "${slot.label}" availability person "${av.person}" has no recognised role`,
      );
    }
  }
}

function validateSlotDiscussion(
  slot: SlotFixture,
  topicsByLabel: Map<string, TopicFixture>,
  peopleByLabel: Map<string, PersonFixture>,
): void {
  for (const d of slot.discussion) {
    if (!peopleByLabel.has(d.author))
      throw new Error(
        `Slot "${slot.label}" discussion references missing author "${d.author}"`,
      );
    if (d.claimTopic && !topicsByLabel.has(d.claimTopic)) {
      throw new Error(
        `Slot "${slot.label}" discussion claims missing topic "${d.claimTopic}"`,
      );
    }
    if (d.claimCounts && !d.claimTopic) {
      throw new Error(
        `Slot "${slot.label}" discussion has Counts without a Claim topic`,
      );
    }
  }
}

function validateSlot(
  slot: SlotFixture,
  topicsByLabel: Map<string, TopicFixture>,
  peopleByLabel: Map<string, PersonFixture>,
): void {
  validateSlotSession(slot, topicsByLabel, peopleByLabel);
  validateSlotAvailability(slot, peopleByLabel);
  validateSlotDiscussion(slot, topicsByLabel, peopleByLabel);
}

function validateFixture(fixture: Fixture): void {
  assertUnique(fixture.people, (person) => person.label, "person label");
  assertUnique(fixture.topics, (topic) => topic.label, "topic label");
  assertUnique(fixture.comments, (comment) => comment.label, "comment id");

  const peopleByLabel = new Map(
    fixture.people.map((person) => [person.label, person]),
  );
  const topicsByLabel = new Map(
    fixture.topics.map((topic) => [topic.label, topic]),
  );
  const commentsByLabel = new Map(
    fixture.comments.map((comment) => [comment.label, comment]),
  );

  const owner = fixture.people.find((person) => person.roles.includes("owner"));
  if (!owner) {
    throw new Error(
      "Sample data must include at least one person with owner role",
    );
  }

  validateTopics(fixture.topics, peopleByLabel);
  validateComments(
    fixture.comments,
    topicsByLabel,
    peopleByLabel,
    commentsByLabel,
  );
  validateHearts(fixture.hearts, topicsByLabel, peopleByLabel);
  validateHostHearts(fixture.hostHearts, topicsByLabel, peopleByLabel);

  assertUnique(fixture.slots, (s) => s.label, "slot label");
  for (const slot of fixture.slots) {
    validateSlot(slot, topicsByLabel, peopleByLabel);
  }
}

export function parseFixture(markdown: string): Fixture {
  const normalized = normalizeMarkdown(markdown);
  const fixture = {
    timetable: parseTimetable(normalized),
    people: parsePeople(normalized),
    topics: parseTopics(normalized),
    comments: parseComments(normalized),
    hearts: parseHearts(normalized),
    hostHearts: parseHostHearts(normalized),
    slots: parseSlots(normalized),
  };

  validateFixture(fixture);
  return fixture;
}

/** Membership rows carry the per-forum profile (name/photo/bio/slug).
 * Slugs are deterministic from display names, "-2" on collision. */
function buildMembershipRows(
  fixture: Fixture,
  timetableId: string,
): NewTimetableMembership[] {
  const seenSlugs = new Map<string, number>();
  const slugFor = (name: string): string => {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "user";
    const n = (seenSlugs.get(base) ?? 0) + 1;
    seenSlugs.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
  return fixture.people.map((person, index) => ({
    id: stableUuid("membership", person.label),
    userId: person.clerkId ?? userIdFor(person.label),
    timetableId,
    roles: person.roles,
    name: person.displayName,
    image: null,
    bio: person.bio,
    slug: slugFor(person.displayName),
    // Digests only email memberships the forum has made contact with
    // (inviteSentAt or a seen-watermark) — seed everyone as invited so a
    // local digest run actually sends.
    inviteSentAt: addMinutes(BASE_TIME, index),
    createdAt: addMinutes(BASE_TIME, index),
    updatedAt: addMinutes(BASE_TIME, index),
  }));
}

export function findSampleFile(): string {
  for (const candidate of sampleFileCandidates) {
    const path = fileURLToPath(candidate);
    if (existsSync(path)) return path;
  }

  throw new Error(
    `Could not find sample data file. Checked: ${sampleFileCandidates
      .map((candidate) => fileURLToPath(candidate))
      .join(", ")}`,
  );
}

/** ❤️/💙 rows are shape-identical; `idPrefix` keeps their stable uuids
 * distinct and both spread across the digest-day HEART_WINDOW. */
function buildGestureRows(
  rows: HeartsFixture[],
  idPrefix: string,
  ids: { topicIds: Map<string, string>; userIds: Map<string, string> },
): NewHeart[] {
  const total = rows.reduce((sum, row) => sum + row.people.length, 0);
  const built: NewHeart[] = [];
  let index = 0;
  for (const row of rows) {
    for (const personLabel of row.people) {
      built.push({
        id: stableUuid(idPrefix, `${row.topic}:${personLabel}`),
        topicId: ids.topicIds.get(row.topic) ?? "",
        userId: ids.userIds.get(personLabel) ?? "",
        createdAt: spreadTime(HEART_WINDOW[0], HEART_WINDOW[1], index, total),
      });
      index += 1;
    }
  }
  return built;
}

function buildRows(fixture: Fixture): {
  timetableId: string;
  ownerId: string;
  users: NewUser[];
  memberships: NewTimetableMembership[];
  timetable: NewTimetable;
  topics: NewTopic[];
  comments: NewComment[];
  hearts: NewHeart[];
  hostHearts: NewHostHeart[];
  activities: NewActivityEvent[];
  timeslotRows: NewTimeslot[];
  slotSessionRows: NewSlotSession[];
  availabilityRows: NewAvailability[];
  slotCommentRows: NewSlotComment[];
  patternRows: NewAvailabilityPattern[];
} {
  const timetableId = stableUuid("timetable", fixture.timetable.slug);
  const owner = fixture.people.find((person) => person.roles.includes("owner"));
  if (!owner) throw new Error("Sample data must include an owner");

  const localIdFor = (person: PersonFixture) =>
    person.clerkId ?? userIdFor(person.label);
  const ownerId = localIdFor(owner);
  const userIds = new Map(
    fixture.people.map((person) => [person.label, localIdFor(person)]),
  );
  const topicIds = new Map(
    fixture.topics.map((topic) => [
      topic.label,
      stableUuid("topic", topic.label),
    ]),
  );
  const commentIds = new Map(
    fixture.comments.map((comment) => [
      comment.label,
      stableUuid("comment", comment.label),
    ]),
  );

  const userRows: NewUser[] = fixture.people.map((person, index) => ({
    id: localIdFor(person),
    name: person.displayName,
    email: person.clerkId
      ? `${person.label.toLowerCase()}@real.clerk`
      : fakeEmailFor(person.label),
    emailVerified: BASE_TIME,
    image: null,
    notificationSettings: {
      digestEnabled: true,
    },
    lastDigestAt: null,
    icsToken: stableUuid("ics", person.label),
    createdAt: addMinutes(BASE_TIME, index),
  }));

  const timetableRow: NewTimetable = {
    id: timetableId,
    slug: fixture.timetable.slug,
    name: fixture.timetable.name,
    privacy: fixture.timetable.privacy,
    customDomain: null,
    settings: {
      roleLabels: fixture.timetable.roleLabels,
      // Calendar v2 switched on for the seeded forum so the feature is
      // immediately QA-able, with a pattern derived from the slot fixtures.
      calendar: buildCalendarSeedSettings(fixture.slots),
    },
    ownerId,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
  };

  const membershipRows = buildMembershipRows(fixture, timetableId);

  const topicRows: NewTopic[] = fixture.topics.map((topic, index) => {
    const createdAt = addMinutes(TOPIC_TIME, index * 15);
    return {
      id: stableUuid("topic", topic.label),
      timetableId,
      hostId: userIds.get(topic.host) ?? "",
      title: topic.title,
      // Fixture labels are unique, so stripping the prefix stays unique.
      slug: topic.label.replace(/^topic-/, ""),
      bodyMd: topic.bodyMd,
      coverImageUrl: topic.coverImageUrl,
      status: topic.status,
      publishedAt: topic.publishedAt,
      createdAt,
      updatedAt: topic.publishedAt ?? createdAt,
    };
  });

  const commentRows = buildCommentRows(
    fixture.comments,
    topicIds,
    userIds,
    commentIds,
    ownerId,
  );

  // Hearts on archived topics simply don't count (the topic isn't
  // published); the old per-row archivedAt marking is gone — "archiving"
  // is now the timetable-level heartsCountFrom cutoff. 💙s share the ❤️
  // window so both land inside the digest day.
  const heartRows = buildGestureRows(fixture.hearts, "heart", {
    topicIds,
    userIds,
  });
  const hostHeartRows: NewHostHeart[] = buildGestureRows(
    fixture.hostHearts,
    "hostheart",
    { topicIds, userIds },
  );

  const activityRows = buildActivityRows(
    fixture,
    timetableId,
    ownerId,
    topicIds,
    userIds,
    commentIds,
  );

  const {
    timeslotRows,
    slotSessionRows,
    availabilityRows,
    slotCommentRows,
    patternRows,
  } = buildSlotRows(fixture, timetableId, userIds, topicIds);

  return {
    timetableId,
    ownerId,
    users: userRows,
    memberships: membershipRows,
    timetable: timetableRow,
    topics: topicRows,
    comments: commentRows,
    hearts: heartRows,
    hostHearts: hostHeartRows,
    activities: activityRows,
    timeslotRows,
    slotSessionRows,
    availabilityRows,
    slotCommentRows,
    patternRows,
  };
}

function toCommentRow(
  comment: CommentFixture,
  ids: {
    topicIds: Map<string, string>;
    userIds: Map<string, string>;
    commentIds: Map<string, string>;
  },
  ownerId: string,
  index: number,
  count: number,
): NewComment {
  const createdAt = spreadTime(
    COMMENT_WINDOW[0],
    COMMENT_WINDOW[1],
    index,
    count,
  );
  const hiddenAt = comment.hidden ? addMinutes(createdAt, 3) : null;

  return {
    id: ids.commentIds.get(comment.label) ?? "",
    topicId: ids.topicIds.get(comment.topic) ?? "",
    parentId: comment.replyTo
      ? (ids.commentIds.get(comment.replyTo) ?? "")
      : null,
    authorId: ids.userIds.get(comment.author) ?? "",
    body: comment.text,
    visibility: comment.visibility,
    hiddenAt,
    hiddenByUserId: hiddenAt ? ownerId : null,
    createdAt,
    updatedAt: hiddenAt ?? createdAt,
  };
}

function buildCommentRows(
  fixtureComments: CommentFixture[],
  topicIds: Map<string, string>,
  userIds: Map<string, string>,
  commentIds: Map<string, string>,
  ownerId: string,
): NewComment[] {
  const pending = new Map(
    fixtureComments.map((comment) => [comment.label, comment]),
  );
  const inserted = new Set<string>();
  const rows: NewComment[] = [];
  const ids = { topicIds, userIds, commentIds };

  while (pending.size > 0) {
    let progressed = false;

    for (const [label, comment] of Array.from(pending.entries())) {
      if (comment.replyTo && !inserted.has(comment.replyTo)) continue;

      rows.push(
        toCommentRow(
          comment,
          ids,
          ownerId,
          rows.length,
          fixtureComments.length,
        ),
      );

      inserted.add(label);
      pending.delete(label);
      progressed = true;
    }

    if (!progressed) {
      throw new Error(
        `Could not order comments by reply parent. Remaining: ${Array.from(
          pending.keys(),
        ).join(", ")}`,
      );
    }
  }

  return rows;
}

type ActivityPush = (
  key: string,
  actorId: string | null,
  action: string,
  payload: Record<string, unknown>,
  note?: string | null,
) => void;

/** Status-appropriate activity events for one seeded topic. */
function pushTopicActivity(
  push: ActivityPush,
  topic: TopicFixture,
  fixture: Fixture,
  ownerId: string,
  topicIds: Map<string, string>,
  userIds: Map<string, string>,
): void {
  const topicId = topicIds.get(topic.label) ?? "";
  const hostId = userIds.get(topic.host) ?? "";
  if (topic.status === "submitted") {
    push(`submit:${topic.label}`, hostId, "topic.submit", {
      topicId,
      title: topic.title,
    });
  } else if (topic.status === "published") {
    push(`publish:${topic.label}`, ownerId, "topic.publish", {
      topicId,
      title: topic.title,
    });
    if (topic.recentlyAssigned) {
      // Payload mirrors reassignTopic in @timetable/core — the digest's
      // "Assigned to you" card reads payload.newHostId.
      push(`reassign:${topic.label}`, ownerId, "topic.reassign", {
        topicId,
        title: topic.title,
        previousHostId: ownerId,
        newHostId: hostId,
      });
    }
  } else if (topic.status === "unpublished") {
    push(`unpublish:${topic.label}`, hostId, "topic.unpublish", {
      topicId,
      title: topic.title,
    });
  } else if (topic.status === "archived") {
    const archivedHeartCount =
      fixture.hearts.find((row) => row.topic === topic.label)?.people.length ??
      0;
    push(`archive:${topic.label}`, ownerId, "topic.archive", {
      topicId,
      title: topic.title,
    });
    push(`archive-hearts:${topic.label}`, ownerId, "hearts.cutoff", {
      topicId,
      title: topic.title,
      count: archivedHeartCount,
    });
  }
}

function buildActivityRows(
  fixture: Fixture,
  timetableId: string,
  ownerId: string,
  topicIds: Map<string, string>,
  userIds: Map<string, string>,
  commentIds: Map<string, string>,
): NewActivityEvent[] {
  const rows: NewActivityEvent[] = [];

  const push: ActivityPush = (key, actorId, action, payload, note = null) => {
    rows.push({
      id: stableUuid("activity", key),
      timetableId,
      actorId,
      action,
      payload,
      note,
      createdAt: SEED_NOW, // remapped below once the count is known
    });
  };

  for (const topic of fixture.topics) {
    pushTopicActivity(push, topic, fixture, ownerId, topicIds, userIds);
  }

  for (const comment of fixture.comments) {
    if (!comment.hidden) continue;
    push(`hide-comment:${comment.label}`, ownerId, "comment.hide", {
      commentId: commentIds.get(comment.label) ?? "",
      topicId: topicIds.get(comment.topic) ?? "",
    });
  }

  return rows.map((row, index) => ({
    ...row,
    createdAt: spreadTime(
      ACTIVITY_WINDOW[0],
      ACTIVITY_WINDOW[1],
      index,
      rows.length,
    ),
  }));
}

const WEEKDAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Slot dates may be absolute ("2026-10-05") or relative ("mon+1" = Monday
 * of next week, "fri+0" = this week's Friday, UTC weeks starting Monday).
 * Relative dates keep the seeded calendar rolling: past sessions in week 0,
 * digest-horizon sessions in weeks +1/+2, open slots beyond.
 */
function resolveSlotDate(raw: string, label: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = /^(sun|mon|tue|wed|thu|fri|sat)([+-]\d+)$/.exec(
    raw.toLowerCase(),
  );
  if (!match) {
    throw new Error(
      `Invalid date "${raw}" for slot "${label}". Use YYYY-MM-DD or a relative "<weekday>[+-]<weeks>" like "mon+1".`,
    );
  }
  const todayUtc = Date.UTC(
    SEED_NOW.getUTCFullYear(),
    SEED_NOW.getUTCMonth(),
    SEED_NOW.getUTCDate(),
  );
  const mondayThisWeek =
    todayUtc - ((new Date(todayUtc).getUTCDay() + 6) % 7) * DAY_MS;
  const dayFromMonday = (WEEKDAY_NAMES.indexOf(match[1]!) + 6) % 7;
  const resolved = new Date(
    mondayThisWeek + (Number(match[2]) * 7 + dayFromMonday) * DAY_MS,
  );
  return resolved.toISOString().slice(0, 10);
}

/** Pattern-cell key for a fixture slot ("{weekday}-{HH:MM}", UTC). */
function slotCellKey(slot: SlotFixture): string {
  const weekday = new Date(`${slot.date}T00:00:00.000Z`).getUTCDay();
  return `${weekday}-${slot.startTime}`;
}

/** Group the sorted distinct grid dates into terms: a gap of more than
 * three weeks between consecutive slots starts a new term. Terms are named
 * by the season + year they start in ("Autumn term 2025"), with a numeric
 * suffix if the fixture yields two terms in the same season. */
function deriveTerms(
  dates: string[],
): { name: string; start: string; end: string }[] {
  const distinct = [...new Set(dates)].sort();
  const first = distinct[0];
  if (!first) return [];
  const runs: string[][] = [[first]];
  for (const date of distinct.slice(1)) {
    const previous = runs.at(-1)!.at(-1)!;
    const gapDays =
      (Date.parse(`${date}T00:00:00.000Z`) -
        Date.parse(`${previous}T00:00:00.000Z`)) /
      DAY_MS;
    if (gapDays > 21) runs.push([date]);
    else runs.at(-1)!.push(date);
  }
  const seen = new Map<string, number>();
  return runs.map((run) => {
    const start = new Date(`${run[0]}T00:00:00.000Z`);
    const month = start.getUTCMonth();
    const season = month >= 8 ? "Autumn" : month <= 2 ? "Spring" : "Summer";
    const base = `${season} term ${start.getUTCFullYear()}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return {
      name: n === 1 ? base : `${base} (${n})`,
      start: run[0]!,
      end: run.at(-1)!,
    };
  });
}

/** Calendar settings for the seeded forum, derived from the slot fixtures:
 * enabled, hosts-may-propose, the distinct weekly cells as the pattern,
 * seasonal terms spanning the fixture dates, and the fixture locations as
 * presets. Off-grid slots (host off-piste proposals) don't shape the
 * pattern. */
function buildCalendarSeedSettings(
  slots: SlotFixture[],
): NonNullable<NewTimetable["settings"]>["calendar"] {
  const gridSlots = slots.filter((slot) => !slot.offGrid);
  if (gridSlots.length === 0) return { enabled: true };
  const cells = new Map<
    string,
    { weekday: number; start: string; end: string }
  >();
  const locations = new Set<string>();
  const dates: string[] = [];
  for (const slot of gridSlots) {
    const weekday = new Date(`${slot.date}T00:00:00.000Z`).getUTCDay();
    cells.set(slotCellKey(slot), {
      weekday,
      start: slot.startTime,
      end: slot.endTime,
    });
    if (slot.location) locations.add(slot.location);
    dates.push(slot.date);
  }
  dates.sort();
  return {
    enabled: true,
    confirmPolicy: "hosts_propose",
    locations: [...locations].sort(),
    patternCells: [...cells.values()].sort(
      (a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start),
    ),
    terms: deriveTerms(dates),
  };
}

/** Standing weekly patterns so inference shows up in dev: electors who never
 * answered slots explicitly but painted the grid — all-green, all-red, a
 * mixed grid, and a partial one (unpainted cells fall back to 🟡). */
function buildPatternRows(
  fixture: Fixture,
  timetableId: string,
  userIds: Map<string, string>,
): NewAvailabilityPattern[] {
  const cellKeys = [
    ...new Set(fixture.slots.filter((s) => !s.offGrid).map(slotCellKey)),
  ].sort();
  if (cellKeys.length === 0) return [];
  const paint = (stateFor: (index: number) => AvailabilityState | null) =>
    Object.fromEntries(
      cellKeys.flatMap((k, i) => {
        const state = stateFor(i);
        return state ? [[k, state]] : [];
      }),
    );
  const patterns: [string, (index: number) => AvailabilityState | null][] = [
    ["elector-grace", () => "green"],
    ["elector-oscar", () => "red"],
    ["elector-yuki", (i) => (i % 2 === 0 ? "green" : "yellow")],
    // Partial pattern: only the first two cells painted, the rest infer 🟡.
    ["elector-ben", (i) => (i < 2 ? "green" : null)],
  ];
  const rows: NewAvailabilityPattern[] = [];
  for (const [label, stateFor] of patterns) {
    const userId = userIds.get(label);
    if (!userId) continue;
    rows.push({
      timetableId,
      userId,
      cells: paint(stateFor),
      updatedAt: BASE_TIME,
    });
  }
  return rows;
}

function buildSlotRows(
  fixture: Fixture,
  timetableId: string,
  userIds: Map<string, string>,
  topicIds: Map<string, string>,
): {
  timeslotRows: NewTimeslot[];
  slotSessionRows: NewSlotSession[];
  availabilityRows: NewAvailability[];
  slotCommentRows: NewSlotComment[];
  patternRows: NewAvailabilityPattern[];
} {
  const hostByTopicLabel = new Map(
    fixture.topics.map((topic) => [topic.label, topic.host]),
  );

  const toSlotCommentRow = (
    slot: SlotFixture,
    slotId: string,
    d: SlotDiscussionEntry,
    index: number,
  ): NewSlotComment => ({
    id: stableUuid("slot-comment", `${slot.label}:${index}`),
    slotId,
    authorId: userIds.get(d.author) ?? "",
    body: d.text,
    ...(d.claimTopic
      ? {
          topicId: topicIds.get(d.claimTopic) ?? null,
          greenCount: d.claimCounts?.green ?? 0,
          yellowCount: d.claimCounts?.yellow ?? 0,
          redCount: d.claimCounts?.red ?? 0,
        }
      : {}),
    createdAt: addMinutes(BASE_TIME, index * 30),
  });

  // Session ownership (the never-displace rule keys off this): the
  // topic's host for topic sessions, the named host for office hours.
  const subjectFor = (slot: SlotFixture) => {
    const topicTag = slot.topicTags[0];
    const topicId = topicTag ? (topicIds.get(topicTag) ?? null) : null;
    const sessionHostLabel = topicTag
      ? hostByTopicLabel.get(topicTag)
      : slot.sessionHost;
    const sessionHostId = sessionHostLabel
      ? (userIds.get(sessionHostLabel) ?? null)
      : null;
    return { topicId, sessionHostId };
  };

  // Bookings model (2026-08-06): one timeslot per (start, end) — fixture
  // slots sharing a time window share the canonical slot, their sessions
  // become separate bookings, and availability/discussion merge onto it.
  const slotIdByTime = new Map<string, string>();
  const timeslotRows: NewTimeslot[] = [];
  const slotSessionRows: NewSlotSession[] = [];
  const availabilityRows: NewAvailability[] = [];
  const seenAvailability = new Set<string>();
  const slotCommentRows: NewSlotComment[] = [];

  const canonicalSlotId = (
    slot: SlotFixture,
    startsAt: Date,
    endsAt: Date,
    sessionHostId: string | null,
  ): string => {
    const timeKey = `${startsAt.getTime()}|${endsAt.getTime()}`;
    const existing = slotIdByTime.get(timeKey);
    if (existing) return existing;
    const slotId = stableUuid("slot", slot.label);
    slotIdByTime.set(timeKey, slotId);
    timeslotRows.push({
      id: slotId,
      timetableId,
      startsAt,
      endsAt,
      // Off-grid = a host's off-piste proposal: no pattern provenance,
      // recorded as created by that host rather than admin generation.
      cellKey: slot.offGrid ? null : slotCellKey(slot),
      createdById: slot.offGrid ? sessionHostId : null,
      createdAt: BASE_TIME,
      updatedAt: SLOT_UPDATED_TIME,
    });
    return slotId;
  };

  const pushAvailability = (slot: SlotFixture, slotId: string): void => {
    for (const av of slot.availability) {
      const userId = userIds.get(av.person) ?? "";
      // Same person answering two same-time fixture slots: first wins.
      const dedupeKey = `${slotId}|${userId}`;
      if (seenAvailability.has(dedupeKey)) continue;
      seenAvailability.add(dedupeKey);
      availabilityRows.push({
        id: stableUuid("slot-avail", `${slot.label}:${av.person}`),
        slotId,
        userId,
        state: av.state,
        updatedAt: BASE_TIME,
      });
    }
  };

  for (const slot of fixture.slots) {
    const startsAt = new Date(`${slot.date}T${slot.startTime}:00.000Z`);
    const endsAt = new Date(`${slot.date}T${slot.endTime}:00.000Z`);
    const { topicId, sessionHostId } = subjectFor(slot);
    const slotId = canonicalSlotId(slot, startsAt, endsAt, sessionHostId);

    if (topicId || sessionHostId) {
      slotSessionRows.push({
        id: stableUuid("slot-session", slot.label),
        slotId,
        location: slot.location,
        topicId,
        sessionHostId,
        status: slot.status ?? "proposed",
        url: slot.url,
        createdById: slot.offGrid ? sessionHostId : null,
        createdAt: BASE_TIME,
        updatedAt: SLOT_UPDATED_TIME,
      });
    }

    pushAvailability(slot, slotId);
    slotCommentRows.push(
      ...slot.discussion.map((d, i) => toSlotCommentRow(slot, slotId, d, i)),
    );
  }

  return {
    timeslotRows,
    slotSessionRows,
    availabilityRows,
    slotCommentRows,
    patternRows: buildPatternRows(fixture, timetableId, userIds),
  };
}

function createSeedDb(databaseUrl: string) {
  const sql = postgres(databaseUrl, {
    max: 1,
    ssl: process.env.DATABASE_SSL === "require" ? "require" : undefined,
  });
  const db = drizzle(sql, { schema, casing: "snake_case" });
  return { sql, db };
}

type SeedDb = ReturnType<typeof createSeedDb>["db"];
type SeedTx = Parameters<Parameters<SeedDb["transaction"]>[0]>[0];

/**
 * Shadow cleanup: a sample person who signed in before this fixture
 * existed got a user row keyed by their raw Clerk id with the same
 * email. Left in place it violates the email unique constraint below
 * (aborting the whole seed) and shadows the fixture at sign-in, since
 * auth returns an existing row by id before consulting externalId.
 * Delete such rows (their content cascades) — unless they own a
 * timetable (ownerId is ON DELETE RESTRICT), which needs a human.
 */
async function removeShadowUsers(
  tx: SeedTx,
  seedUsers: NewUser[],
): Promise<void> {
  const ownerIds = new Set(
    (await tx.select({ ownerId: timetables.ownerId }).from(timetables)).map(
      (r) => r.ownerId,
    ),
  );
  for (const user of seedUsers) {
    if (!user.email || !user.id) continue;
    const clashes = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, user.email), ne(users.id, user.id)));
    for (const clash of clashes) {
      if (ownerIds.has(clash.id)) {
        throw new Error(
          `Cannot seed user "${user.id}": existing user "${clash.id}" holds ` +
            `email ${user.email} and owns a timetable. Transfer or delete ` +
            `that timetable, or run with SEED_DEV_RESET_DATABASE=true.`,
        );
      }
      console.warn(
        `Removing shadow user "${clash.id}" holding sample email ${user.email}.`,
      );
      await tx.delete(users).where(eq(users.id, clash.id));
    }
  }
}

async function upsertUsers(tx: SeedTx, seedUsers: NewUser[]): Promise<void> {
  for (const user of seedUsers) {
    await tx
      .insert(users)
      .values(user)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          image: user.image,
          notificationSettings: user.notificationSettings,
          lastDigestAt: user.lastDigestAt,
          icsToken: user.icsToken,
          createdAt: user.createdAt,
        },
      });
  }
}

/** Replace the fixture timetable (delete cascades) and insert its rows. */
async function insertFixtureRows(
  tx: SeedTx,
  fixture: Fixture,
  rows: ReturnType<typeof buildRows>,
): Promise<void> {
  await tx
    .delete(timetables)
    .where(eq(timetables.slug, fixture.timetable.slug));
  await tx.insert(timetables).values(rows.timetable);
  await tx.insert(timetableMemberships).values(rows.memberships);
  await tx.insert(topics).values(rows.topics);

  if (rows.comments.length > 0) {
    await tx.insert(comments).values(rows.comments);
  }
  if (rows.hearts.length > 0) {
    await tx.insert(hearts).values(rows.hearts);
  }
  if (rows.hostHearts.length > 0) {
    await tx.insert(hostHearts).values(rows.hostHearts);
  }
  if (rows.activities.length > 0) {
    await tx.insert(activityEvents).values(rows.activities);
  }
  if (rows.timeslotRows.length > 0) {
    await tx.insert(timeslots).values(rows.timeslotRows);
  }
  if (rows.slotSessionRows.length > 0) {
    await tx.insert(slotSessions).values(rows.slotSessionRows);
  }
  if (rows.availabilityRows.length > 0) {
    await tx.insert(availability).values(rows.availabilityRows);
  }
  if (rows.slotCommentRows.length > 0) {
    await tx.insert(slotComments).values(rows.slotCommentRows);
  }
  if (rows.patternRows.length > 0) {
    await tx.insert(availabilityPatterns).values(rows.patternRows);
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed the dev database");
  }

  const sampleFile = findSampleFile();
  const fixture = parseFixture(readFileSync(sampleFile, "utf8"));
  const rows = buildRows(fixture);
  const resetDevDatabase = shouldResetDevDatabase();

  const { sql, db } = createSeedDb(databaseUrl);

  try {
    await db.transaction(async (tx) => {
      if (resetDevDatabase) {
        await tx.execute(drizzleSql.raw(resetDatabaseSql()));
      }
      await removeShadowUsers(tx, rows.users);
      await upsertUsers(tx, rows.users);
      await insertFixtureRows(tx, fixture, rows);
    });
  } finally {
    await sql.end();
  }

  console.log(`Seeded "${fixture.timetable.name}" from ${sampleFile}`);
  if (resetDevDatabase) {
    console.log("Reset dev database app tables before seeding");
  }
  console.log(`Timetable slug: ${fixture.timetable.slug}`);
  console.log(
    `Owner dev user: ${rows.ownerId} (${fakeEmailFor(ownerLabel(fixture))})`,
  );
  console.log(
    [
      `${rows.users.length} users`,
      `${rows.topics.length} topics`,
      `${rows.comments.length} comments`,
      `${rows.hearts.length} hearts`,
      `${rows.hostHearts.length} host hearts`,
      `${rows.activities.length} activity events`,
      `${rows.timeslotRows.length} timeslots`,
    ].join(", "),
  );
}

function ownerLabel(fixture: Fixture): string {
  const owner = fixture.people.find((person) => person.roles.includes("owner"));
  if (!owner) throw new Error("Sample data must include an owner");
  return owner.label;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
