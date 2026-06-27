import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import { config } from "dotenv";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";
import {
  activityEvents,
  availability,
  comments,
  hearts,
  slotComments,
  slotTopics,
  timetableMemberships,
  timetables,
  timeslots,
  topics,
  users,
  type AvailabilityState,
  type CommentVisibility,
  type NewActivityEvent,
  type NewAvailability,
  type NewComment,
  type NewHeart,
  type NewSlotComment,
  type NewSlotTopic,
  type NewTimetable,
  type NewTimetableMembership,
  type NewTopic,
  type NewTimeslot,
  type NewUser,
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
  "draft",
  "submitted",
  "published",
  "unpublished",
  "archived",
] as const satisfies readonly TopicStatus[];

const COMMENT_VISIBILITY_VALUES = [
  "public",
  "host_only",
] as const satisfies readonly CommentVisibility[];

const TIMETABLE_PRIVACY_VALUES = ["deactivated", "private", "public"] as const;
type TimetablePrivacy = (typeof TIMETABLE_PRIVACY_VALUES)[number];

const AVAILABILITY_STATE_VALUES = ['green', 'yellow', 'red'] as const satisfies readonly AvailabilityState[];

type SlotAvailability = { person: string; state: AvailabilityState };
type SlotDiscussionEntry = { author: string; text: string };

type SlotFixture = {
  label: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  location: string;
  topicTags: string[];
  availability: SlotAvailability[];
  discussion: SlotDiscussionEntry[];
};

const BASE_TIME = new Date("2026-06-01T09:00:00.000Z");
const TOPIC_TIME = new Date("2026-06-09T09:00:00.000Z");
const COMMENT_TIME = new Date("2026-06-20T09:00:00.000Z");
const HEART_TIME = new Date("2026-06-21T09:00:00.000Z");
const ACTIVITY_TIME = new Date("2026-06-22T09:00:00.000Z");
const RESET_DATABASE_TABLES = [
  "api_rate_limit_buckets",
  "activity_events",
  "slot_topics",
  "slot_comments",
  "availability",
  "timeslots",
  "comments",
  "hearts",
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
  description: string | null;
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
  const description = fieldFromBlock(block, "Description") || null;
  const privacyRaw = fieldFromBlock(block, "Privacy", { required: true });
  const privacy =
    /\*\*(deactivated|private|public)\*\*/.exec(privacyRaw)?.[1] ??
    privacyRaw.trim();

  if (!hasValue(TIMETABLE_PRIVACY_VALUES, privacy)) {
    throw new Error(
      `Invalid timetable privacy "${privacyRaw}". Valid values: ${TIMETABLE_PRIVACY_VALUES.join(", ")}`,
    );
  }

  const roleLabels: RoleLabels = {};
  for (const match of block.matchAll(/^- (Admin|Host|Elector):[ \t]*(.+)$/gim)) {
    const role = match[1]?.toLowerCase() as keyof NonNullable<RoleLabels>;
    const label = match[2]?.trim();
    if (role && label) roleLabels[role] = label;
  }

  return { name, slug, description, privacy, roleLabels };
}

function parsePeople(markdown: string): PersonFixture[] {
  const block = section(markdown, "People");
  const people: PersonFixture[] = [];

  for (const line of block.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    if (line.includes("---") || line.includes("Person label") || line.includes("Clerk ID")) continue;

    const [label, displayName, rolesRaw, bioRaw, clerkIdRaw] = markdownTableCells(line);
    if (!label || !displayName || !rolesRaw) {
      throw new Error(`Invalid person row: ${line}`);
    }

    const roles: Role[] = [];
    for (const role of rolesRaw.split(",").map((value) => value.trim())) {
      if (!hasValue(ROLE_VALUES, role)) {
        throw new Error(
          `Invalid role "${role}" for person "${label}". Valid roles: ${ROLE_VALUES.join(", ")}`,
        );
      }
      roles.push(role);
    }

    people.push({
      label,
      displayName,
      roles,
      bio: bioRaw?.trim() || null,
      clerkId: clerkIdRaw?.trim() || null,
    });
  }

  if (people.length === 0) {
    throw new Error("No people found in sample data");
  }

  return people;
}

function parseTopicDate(value: string, label: string): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(
      `Invalid published date "${value}" for topic "${label}". Use YYYY-MM-DD.`,
    );
  }
  return new Date(`${value}T12:00:00.000Z`);
}

function parseTopics(markdown: string): TopicFixture[] {
  const block = section(markdown, "Topics");
  const topicBlocks = block.split(/^### Topic:\s*/m).slice(1);
  const parsed: TopicFixture[] = [];

  for (const topicBlock of topicBlocks) {
    const firstNewline = topicBlock.indexOf("\n");
    const label =
      firstNewline === -1
        ? topicBlock.trim()
        : topicBlock.slice(0, firstNewline).trim();
    const rest = firstNewline === -1 ? "" : topicBlock.slice(firstNewline + 1);

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

    if (!hasValue(TOPIC_STATUS_VALUES, statusRaw)) {
      throw new Error(
        `Invalid status "${statusRaw}" for topic "${label}". Valid statuses: ${TOPIC_STATUS_VALUES.join(", ")}`,
      );
    }

    parsed.push({
      label,
      title,
      host,
      status: statusRaw,
      publishedAt: parseTopicDate(
        fieldFromBlock(fields, "Published date, if published"),
        label,
      ),
      coverImageUrl: fieldFromBlock(fields, "Cover image URL, if any") || null,
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
  if (hasValue(COMMENT_VISIBILITY_VALUES, normalized)) return normalized;
  throw new Error(
    `Invalid visibility "${value}" for comment "${label}". Valid values: public, hosts only`,
  );
}

function parseHidden(value: string | undefined, label: string): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  if (["yes", "true"].includes(normalized)) return true;
  if (["no", "false"].includes(normalized)) return false;
  throw new Error(
    `Invalid Hidden value "${value}" for comment "${label}". Use yes or no.`,
  );
}

function parseComments(markdown: string): CommentFixture[] {
  const block = section(markdown, "Comments");
  const commentsFixture: CommentFixture[] = [];
  let current: Record<string, string> | null = null;
  let currentTextContinuation = false;

  function flush(): void {
    if (!current) return;

    const topic = current["Topic"];
    const label = current["Comment id"];
    const author = current["Author"];
    const visibility = current["Visibility"];
    const text = current["Text"];

    if (!topic || !label || !author || !visibility || !text) {
      throw new Error(
        `Comment is missing one of Topic, Comment id, Author, Visibility, or Text: ${JSON.stringify(current)}`,
      );
    }

    commentsFixture.push({
      label,
      topic,
      author,
      visibility: visibilityFromText(visibility, label),
      replyTo: current["Reply to"] || null,
      hidden: parseHidden(current["Hidden"], label),
      text,
    });
  }

  for (const rawLine of block.split("\n")) {
    const line = rawLine.trimEnd();
    const topicMatch = /^- Topic:\s*(.+)$/.exec(line);
    if (topicMatch) {
      flush();
      current = { Topic: topicMatch[1]?.trim() ?? "" };
      currentTextContinuation = false;
      continue;
    }

    if (!current) continue;

    const fieldMatch = /^ {2}([^:]+):\s*(.*)$/.exec(line);
    if (fieldMatch) {
      const key = fieldMatch[1]?.trim() ?? "";
      const value = fieldMatch[2]?.trim() ?? "";
      current[key] = value;
      currentTextContinuation = key === "Text";
      continue;
    }

    if (currentTextContinuation && line.startsWith("  ")) {
      current["Text"] = `${current["Text"] ?? ""}\n${line.trim()}`;
    }
  }

  flush();
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

function parseSlots(markdown: string): SlotFixture[] {
  let block: string;
  try {
    block = section(markdown, "Timeslots");
  } catch {
    return [];
  }

  const slotBlocks = block.split(/^### Slot:\s*/m).slice(1);
  const parsed: SlotFixture[] = [];

  for (const slotBlock of slotBlocks) {
    const firstNewline = slotBlock.indexOf("\n");
    const label =
      firstNewline === -1
        ? slotBlock.trim()
        : slotBlock.slice(0, firstNewline).trim();
    const rest = firstNewline === -1 ? "" : slotBlock.slice(firstNewline + 1);

    if (!label) throw new Error("Found slot section without a label");

    const date = fieldFromBlock(rest, "Date", { required: true });
    const startTime = fieldFromBlock(rest, "Start", { required: true });
    const endTime = fieldFromBlock(rest, "End", { required: true });
    const location = fieldFromBlock(rest, "Location", { required: true });
    const topicsRaw = fieldFromBlock(rest, "Topics");
    const topicTags = topicsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    // Parse Availability table
    const availabilityEntries: SlotAvailability[] = [];
    const availMatch = /^Availability:\s*$([\s\S]*?)(?=^(?:Discussion:|###|\Z))/m.exec(rest);
    if (availMatch) {
      for (const line of availMatch[1]!.split("\n")) {
        if (!line.trim().startsWith("|")) continue;
        if (line.includes("---") || line.toLowerCase().includes("person label") || line.toLowerCase().includes("state")) continue;
        const cells = markdownTableCells(line);
        const person = cells[0]?.trim();
        const stateRaw = cells[1]?.trim().toLowerCase() ?? "";
        if (!person) continue;
        if (!hasValue(AVAILABILITY_STATE_VALUES, stateRaw)) {
          throw new Error(`Invalid availability state "${stateRaw}" for slot "${label}"`);
        }
        availabilityEntries.push({ person, state: stateRaw });
      }
    }

    // Parse Discussion list
    const discussion: SlotDiscussionEntry[] = [];
    const discussMatch = /^Discussion:\s*$([\s\S]*?)(?=^###|\Z)/m.exec(rest);
    if (discussMatch) {
      let current: SlotDiscussionEntry | null = null;
      for (const rawLine of discussMatch[1]!.split("\n")) {
        const line = rawLine.trimEnd();
        const authorMatch = /^- Author:\s*(.+)$/.exec(line);
        if (authorMatch) {
          if (current) discussion.push(current);
          current = { author: authorMatch[1]!.trim(), text: "" };
          continue;
        }
        if (current) {
          const textMatch = /^ {2}Text:\s*(.*)$/.exec(line);
          if (textMatch) {
            current.text = textMatch[1]?.trim() ?? "";
            continue;
          }
          if (line.startsWith("  ") && line.trim()) {
            current.text = current.text
              ? `${current.text}\n${line.trim()}`
              : line.trim();
          }
        }
      }
      if (current) discussion.push(current);
    }

    parsed.push({
      label,
      date,
      startTime,
      endTime,
      location,
      topicTags,
      availability: availabilityEntries,
      discussion,
    });
  }

  return parsed;
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
    throw new Error("Sample data must include at least one person with owner role");
  }

  for (const topic of fixture.topics) {
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

  for (const comment of fixture.comments) {
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

  const seenHearts = new Set<string>();
  for (const row of fixture.hearts) {
    const topic = topicsByLabel.get(row.topic);
    if (!topic) {
      throw new Error(`Hearts row refers to missing topic "${row.topic}"`);
    }
    if (!["published", "archived"].includes(topic.status)) {
      throw new Error(
        `Hearts row for topic "${row.topic}" targets a ${topic.status} topic; only published or archived topics should be hearted`,
      );
    }

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

  assertUnique(fixture.slots, s => s.label, 'slot label');
  for (const slot of fixture.slots) {
    for (const tag of slot.topicTags) {
      if (!topicsByLabel.has(tag)) throw new Error(`Slot "${slot.label}" references missing topic "${tag}"`);
    }
    for (const av of slot.availability) {
      const p = peopleByLabel.get(av.person);
      if (!p) throw new Error(`Slot "${slot.label}" availability references missing person "${av.person}"`);
      if (!p.roles.includes('elector') && !p.roles.includes('host') && !p.roles.includes('admin') && !p.roles.includes('owner')) {
        throw new Error(`Slot "${slot.label}" availability person "${av.person}" has no recognised role`);
      }
    }
    for (const d of slot.discussion) {
      if (!peopleByLabel.has(d.author)) throw new Error(`Slot "${slot.label}" discussion references missing author "${d.author}"`);
    }
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
    slots: parseSlots(normalized),
  };

  validateFixture(fixture);
  return fixture;
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

function buildRows(fixture: Fixture): {
  timetableId: string;
  ownerId: string;
  users: NewUser[];
  memberships: NewTimetableMembership[];
  timetable: NewTimetable;
  topics: NewTopic[];
  comments: NewComment[];
  hearts: NewHeart[];
  activities: NewActivityEvent[];
  timeslotRows: NewTimeslot[];
  availabilityRows: NewAvailability[];
  slotCommentRows: NewSlotComment[];
  slotTopicRows: NewSlotTopic[];
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
    email: person.clerkId ? `${person.label.toLowerCase()}@real.clerk` : fakeEmailFor(person.label),
    emailVerified: BASE_TIME,
    image: null,
    bio: person.bio,
    notificationSettings: {
      digestNewTopics: true,
      digestReplies: true,
      digestActivity: person.roles.includes("admin"),
    },
    lastDigestAt: null,
    icsToken: stableUuid("ics", person.label),
    createdAt: addMinutes(BASE_TIME, index),
  }));

  const timetableRow: NewTimetable = {
    id: timetableId,
    slug: fixture.timetable.slug,
    name: fixture.timetable.name,
    description: fixture.timetable.description,
    privacy: fixture.timetable.privacy,
    customDomain: null,
    settings: { roleLabels: fixture.timetable.roleLabels },
    ownerId,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
  };

  const membershipRows: NewTimetableMembership[] = fixture.people.map(
    (person, index) => ({
      id: stableUuid("membership", person.label),
      userId: localIdFor(person),
      timetableId,
      roles: person.roles,
      createdAt: addMinutes(BASE_TIME, index),
      updatedAt: addMinutes(BASE_TIME, index),
    }),
  );

  const topicRows: NewTopic[] = fixture.topics.map((topic, index) => {
    const createdAt = addMinutes(TOPIC_TIME, index * 15);
    return {
      id: stableUuid("topic", topic.label),
      timetableId,
      hostId: userIds.get(topic.host) ?? "",
      title: topic.title,
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

  const heartRows: NewHeart[] = [];
  let heartIndex = 0;
  for (const row of fixture.hearts) {
    const topic = fixture.topics.find((candidate) => candidate.label === row.topic);
    const archivedAt =
      topic?.status === "archived" ? new Date("2026-05-03T12:00:00.000Z") : null;

    for (const personLabel of row.people) {
      heartRows.push({
        id: stableUuid("heart", `${row.topic}:${personLabel}`),
        topicId: topicIds.get(row.topic) ?? "",
        userId: userIds.get(personLabel) ?? "",
        createdAt: addMinutes(HEART_TIME, heartIndex),
        archivedAt,
      });
      heartIndex += 1;
    }
  }

  const activityRows = buildActivityRows(
    fixture,
    timetableId,
    ownerId,
    topicIds,
    userIds,
    commentIds,
  );

  const { timeslotRows, availabilityRows, slotCommentRows, slotTopicRows } =
    buildSlotRows(fixture, timetableId, userIds, topicIds);

  return {
    timetableId,
    ownerId,
    users: userRows,
    memberships: membershipRows,
    timetable: timetableRow,
    topics: topicRows,
    comments: commentRows,
    hearts: heartRows,
    activities: activityRows,
    timeslotRows,
    availabilityRows,
    slotCommentRows,
    slotTopicRows,
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

  while (pending.size > 0) {
    let progressed = false;

    for (const [label, comment] of Array.from(pending.entries())) {
      if (comment.replyTo && !inserted.has(comment.replyTo)) continue;

      const createdAt = addMinutes(COMMENT_TIME, rows.length * 7);
      const hiddenAt = comment.hidden ? addMinutes(createdAt, 3) : null;

      rows.push({
        id: commentIds.get(label) ?? "",
        topicId: topicIds.get(comment.topic) ?? "",
        parentId: comment.replyTo ? (commentIds.get(comment.replyTo) ?? "") : null,
        authorId: userIds.get(comment.author) ?? "",
        body: comment.text,
        visibility: comment.visibility,
        hiddenAt,
        hiddenByUserId: hiddenAt ? ownerId : null,
        createdAt,
        updatedAt: hiddenAt ?? createdAt,
      });

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

function buildActivityRows(
  fixture: Fixture,
  timetableId: string,
  ownerId: string,
  topicIds: Map<string, string>,
  userIds: Map<string, string>,
  commentIds: Map<string, string>,
): NewActivityEvent[] {
  const rows: NewActivityEvent[] = [];

  function push(
    key: string,
    actorId: string | null,
    action: string,
    payload: Record<string, unknown>,
    note: string | null = null,
  ): void {
    rows.push({
      id: stableUuid("activity", key),
      timetableId,
      actorId,
      action,
      payload,
      note,
      createdAt: addMinutes(ACTIVITY_TIME, rows.length * 11),
    });
  }

  for (const topic of fixture.topics) {
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
    } else if (topic.status === "unpublished") {
      push(`unpublish:${topic.label}`, hostId, "topic.unpublish", {
        topicId,
        title: topic.title,
      });
    } else if (topic.status === "archived") {
      const archivedHeartCount =
        fixture.hearts.find((row) => row.topic === topic.label)?.people.length ?? 0;
      push(`archive:${topic.label}`, ownerId, "topic.archive", {
        topicId,
        title: topic.title,
      });
      push(`archive-hearts:${topic.label}`, ownerId, "hearts.archive", {
        topicId,
        title: topic.title,
        count: archivedHeartCount,
      });
    }
  }

  for (const comment of fixture.comments) {
    if (!comment.hidden) continue;
    push(`hide-comment:${comment.label}`, ownerId, "comment.hide", {
      commentId: commentIds.get(comment.label) ?? "",
      topicId: topicIds.get(comment.topic) ?? "",
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
  availabilityRows: NewAvailability[];
  slotCommentRows: NewSlotComment[];
  slotTopicRows: NewSlotTopic[];
} {
  const timeslotRows: NewTimeslot[] = [];
  const availabilityRows: NewAvailability[] = [];
  const slotCommentRows: NewSlotComment[] = [];
  const slotTopicRows: NewSlotTopic[] = [];

  for (const slot of fixture.slots) {
    const slotId = stableUuid('slot', slot.label);
    const startsAt = new Date(`${slot.date}T${slot.startTime}:00.000Z`);
    const endsAt = new Date(`${slot.date}T${slot.endTime}:00.000Z`);

    timeslotRows.push({
      id: slotId,
      timetableId,
      startsAt,
      endsAt,
      location: slot.location,
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
    });

    for (const av of slot.availability) {
      availabilityRows.push({
        id: stableUuid('slot-avail', `${slot.label}:${av.person}`),
        slotId,
        userId: userIds.get(av.person) ?? "",
        state: av.state,
        updatedAt: BASE_TIME,
      });
    }

    for (let i = 0; i < slot.discussion.length; i++) {
      const d = slot.discussion[i]!;
      slotCommentRows.push({
        id: stableUuid('slot-comment', `${slot.label}:${i}`),
        slotId,
        authorId: userIds.get(d.author) ?? "",
        body: d.text,
        createdAt: BASE_TIME,
      });
    }

    for (const tag of slot.topicTags) {
      const topicId = topicIds.get(tag) ?? "";
      slotTopicRows.push({ slotId, topicId, createdAt: BASE_TIME });
    }
  }

  return { timeslotRows, availabilityRows, slotCommentRows, slotTopicRows };
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

  const sql = postgres(databaseUrl, {
    max: 1,
    ssl: process.env.DATABASE_SSL === "require" ? "require" : undefined,
  });
  const db = drizzle(sql, { schema, casing: "snake_case" });

  try {
    await db.transaction(async (tx) => {
      if (resetDevDatabase) {
        await tx.execute(drizzleSql.raw(resetDatabaseSql()));
      }

      for (const user of rows.users) {
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
              bio: user.bio,
              notificationSettings: user.notificationSettings,
              lastDigestAt: user.lastDigestAt,
              icsToken: user.icsToken,
              createdAt: user.createdAt,
            },
          });
      }

      await tx.delete(timetables).where(eq(timetables.slug, fixture.timetable.slug));
      await tx.insert(timetables).values(rows.timetable);
      await tx.insert(timetableMemberships).values(rows.memberships);
      await tx.insert(topics).values(rows.topics);

      if (rows.comments.length > 0) {
        await tx.insert(comments).values(rows.comments);
      }
      if (rows.hearts.length > 0) {
        await tx.insert(hearts).values(rows.hearts);
      }
      if (rows.activities.length > 0) {
        await tx.insert(activityEvents).values(rows.activities);
      }
      if (rows.timeslotRows.length > 0) {
        await tx.insert(timeslots).values(rows.timeslotRows);
      }
      if (rows.availabilityRows.length > 0) {
        await tx.insert(availability).values(rows.availabilityRows);
      }
      if (rows.slotCommentRows.length > 0) {
        await tx.insert(slotComments).values(rows.slotCommentRows);
      }
      if (rows.slotTopicRows.length > 0) {
        await tx.insert(slotTopics).values(rows.slotTopicRows);
      }
    });
  } finally {
    await sql.end();
  }

  console.log(`Seeded "${fixture.timetable.name}" from ${sampleFile}`);
  if (resetDevDatabase) {
    console.log("Reset dev database app tables before seeding");
  }
  console.log(`Timetable slug: ${fixture.timetable.slug}`);
  console.log(`Owner dev user: ${rows.ownerId} (${fakeEmailFor(ownerLabel(fixture))})`);
  console.log(
    [
      `${rows.users.length} users`,
      `${rows.topics.length} topics`,
      `${rows.comments.length} comments`,
      `${rows.hearts.length} hearts`,
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
