#!/usr/bin/env node
/**
 * Re-runnable generator that writes a multi-year calendar history into the
 * Timeslots section of dev-sample-data.md. Deterministic: same input file +
 * SEED constant → byte-identical output.
 *
 * Layout: ten ~11-week terms spanning roughly two years back to one year
 * ahead, expressed with the fixture's relative dates ("mon-104" = Monday
 * 104 weeks ago) so the whole history stays anchored to the seed run.
 * The hand-authored current-window slots (weeks 0..+3) are preserved above
 * the marker; the generator fills the current term's other weeks (-7..-1,
 * +4..+5) plus the nine surrounding terms.
 *
 * Content per term week: the five standard pattern cells, most carrying a
 * session — past terms are mostly booked (confirmed, Luma URLs), future
 * terms mix booked, pencilled (proposed, some with claim comments and
 * frozen 🟢🟡🔴 counts), and open slots. Sprinkled on top: parallel
 * bookings (a second session in the same time window, different room —
 * the bookings model merges them onto one timeslot), office-hours
 * sessions, and off-grid Saturday/evening proposals.
 *
 * Electors grace/oscar/yuki/ben never appear in generated availability —
 * their standing patterns must stay the only source of their states.
 *
 * Output replaces everything between the GENERATED marker and
 * "## Notes for engineers".
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "dev-sample-data.md",
);
const MARKER =
  "<!-- GENERATED SLOTS (scripts/generate-seed-slots.mjs) — do not hand-edit below this line -->";
const SEED = 7;

// --- deterministic PRNG -----------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
function shuffled(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// --- parse the fixture ------------------------------------------------------
const src = readFileSync(FIXTURE, "utf8");

const people = [];
for (const line of src.split("\n")) {
  const m =
    /^\|\s*((?:admin|host|elector)-[a-z]+)\s*\|\s*([^|]+)\|\s*([^|]+)\|/.exec(
      line,
    );
  if (m)
    people.push({
      label: m[1],
      roles: m[3].split(",").map((r) => r.trim()),
    });
}
const hosts = people
  .filter((p) => p.roles.includes("host"))
  .map((p) => p.label);
// Pattern-only electors: their inferred states are a deliberate QA fixture.
const PATTERN_ONLY = new Set([
  "elector-grace",
  "elector-oscar",
  "elector-yuki",
  "elector-ben",
]);
const availabilityElectors = people
  .filter((p) => p.roles.includes("elector") && !PATTERN_ONLY.has(p.label))
  .map((p) => p.label);

const topics = [];
for (const block of src.split(/^### Topic:\s*/m).slice(1)) {
  const label = block.slice(0, block.indexOf("\n")).trim();
  const title = /^Title:\s*(.+)$/m.exec(block)?.[1]?.trim() ?? label;
  const host = /^Host:\s*(.+)$/m.exec(block)?.[1]?.trim();
  const status = /^Status:\s*(.+)$/m.exec(block)?.[1]?.trim();
  if (label && host && status === "published")
    topics.push({ label, title, host });
}

// --- schedule shape ---------------------------------------------------------
/** The five weekly pattern cells (must match the hand-authored slots — the
 * seed derives the forum's pattern grid from ALL grid slots). */
const CELLS = [
  { day: "mon", start: "10:00", end: "12:00", location: "Classroom" },
  { day: "tue", start: "14:00", end: "16:00", location: "Hall" },
  { day: "wed", start: "10:00", end: "11:30", location: "Lounge" },
  { day: "thu", start: "16:00", end: "18:00", location: "Classroom" },
  { day: "fri", start: "13:00", end: "15:00", location: "Terrace" },
];
const LOCATIONS = [
  "Classroom",
  "Hall",
  "Lounge",
  "Terrace",
  "Seminar Room",
  "Library",
  "Auditorium",
];

/** Term windows in week offsets from the current week (inclusive). Weeks
 * 0..+3 of the current term are hand-authored above the marker. Inter-term
 * gaps are ≥24 days so the seed's term derivation splits them. */
const TERMS = [
  { from: -110, to: -100 },
  { from: -96, to: -86 },
  { from: -82, to: -72 },
  { from: -58, to: -48 },
  { from: -44, to: -34 },
  { from: -30, to: -20 },
  { from: -7, to: 5, skip: [0, 1, 2, 3] },
  { from: 9, to: 19 },
  { from: 23, to: 33 },
  { from: 37, to: 47 },
];

// --- text pools -------------------------------------------------------------
const CLAIM_TEXTS = [
  "I'd like this slot for {title} — the availability here looks strong.",
  "Claiming this for {title}; most of my hearters are free at this time.",
  "Pencilling {title} in here — happy to move if someone needs the room more.",
  "{title} wants exactly this kind of slot. Claiming.",
  "Proposing {title} for this one — the counts look workable.",
];
const ADMIN_CLAIM_REPLIES = [
  "Looks good — I'll confirm once the room booking is checked.",
  "Noted. Give it a few days for objections, then I'll book it.",
  "Strong claim. Confirming later this week.",
  "Works for me, pending the projector situation.",
];
const ADMIN_CONFIRMS = [
  "Confirmed — event page is up.",
  "Booked. Add it to your calendars.",
  "Confirmed and announced.",
  "Locked in — see the event link for details.",
];
const PAST_NOTES = [
  "Great turnout for this one.",
  "Notes from the session are in the shared drive.",
  "This ran long — we should book a double slot next time.",
  "Recording link is in the usual place.",
  "Smaller group than expected but a really good discussion.",
];
const OFFICE_HOURS = [
  "Office hours — drop in with whatever you're working on.",
  "Open surgery: bring a problem, leave with a plan. No agenda.",
  "Drop-in hours — questions, prototypes, half-formed ideas all welcome.",
];
const OFF_GRID_TEXTS = [
  "Off-piste proposal — this one wants a different kind of space.",
  "Proposing an extra slot outside the usual grid; daytimes are full.",
  "Evening experiment: same format, different energy. Who's in?",
];

// --- topic cycling ----------------------------------------------------------
let queue = [];
const topicByLabel = new Map(topics.map((t) => [t.label, t]));
function nextTopic(usedThisTerm) {
  for (let attempts = 0; attempts < topics.length + 1; attempts++) {
    if (queue.length === 0) queue = shuffled(topics.map((t) => t.label));
    const label = queue.shift();
    if (!usedThisTerm.has(label)) {
      usedThisTerm.add(label);
      return topicByLabel.get(label);
    }
    queue.push(label);
  }
  return topicByLabel.get(queue.shift());
}

// --- emission ---------------------------------------------------------------
const out = [];
const counts = { slots: 0, confirmed: 0, proposed: 0, empty: 0 };

function dateToken(day, week) {
  return `${day}${week < 0 ? "-" : "+"}${Math.abs(week)}`;
}

function labelFor(week, day, suffix = "") {
  return `slot-g${week < 0 ? "m" : "p"}${Math.abs(week)}-${day}${suffix}`;
}

function emitAvailability(lines) {
  const n = randInt(3, 6);
  const chosen = shuffled(availabilityElectors).slice(0, n);
  lines.push("Availability:", "| Person label | State |", "| --- | --- |");
  for (const person of chosen) {
    const roll = rand();
    const state = roll < 0.55 ? "green" : roll < 0.8 ? "yellow" : "red";
    lines.push(`| ${person} | ${state} |`);
  }
  lines.push("");
}

function emitDiscussion(lines, entries) {
  lines.push("Discussion:");
  for (const entry of entries) {
    lines.push(`- Author: ${entry.author}`);
    if (entry.claim) {
      lines.push(`  Claim: ${entry.claim}`);
      lines.push(
        `  Counts: ${randInt(4, 12)} green, ${randInt(1, 6)} yellow, ${randInt(0, 3)} red`,
      );
    }
    lines.push(`  Text: ${entry.text}`);
  }
  lines.push("");
}

function sessionDiscussion({ isPast, status, topic }) {
  const entries = [];
  if (isPast) {
    if (rand() < 0.12)
      entries.push({
        author: rand() < 0.5 ? topic.host : "admin-edwin",
        text: pick(PAST_NOTES),
      });
    return entries;
  }
  if (status === "proposed" && rand() < 0.55) {
    entries.push({
      author: topic.host,
      claim: topic.label,
      text: pick(CLAIM_TEXTS).replaceAll("{title}", topic.title),
    });
    if (rand() < 0.4)
      entries.push({ author: "admin-edwin", text: pick(ADMIN_CLAIM_REPLIES) });
  } else if (status === "confirmed" && rand() < 0.35) {
    entries.push({ author: "admin-edwin", text: pick(ADMIN_CONFIRMS) });
  }
  return entries;
}

function sessionFieldLines({ topic, officeHours, status }, offGrid) {
  const lines = [officeHours ? "Topics:" : `Topics: ${topic.label}`];
  if (officeHours) lines.push(`Session host: ${officeHours}`);
  lines.push(`Status: ${status}`);
  counts[status]++;
  if (status === "confirmed" && !officeHours && rand() < 0.7) {
    lines.push(`Url: https://lu.ma/spt-${topic.label.replace(/^topic-/, "")}`);
  }
  if (offGrid) lines.push("Off-grid: yes");
  return lines;
}

function discussionFor({ topic, officeHours, status }, offGrid, isPast) {
  if (officeHours) return [{ author: officeHours, text: pick(OFFICE_HOURS) }];
  if (offGrid) return [{ author: topic.host, text: pick(OFF_GRID_TEXTS) }];
  return sessionDiscussion({ isPast, status, topic });
}

/**
 * Emit one slot block. session: null (open slot) or
 * {topic} / {officeHours: hostLabel}, plus status.
 */
function emitSlot({ label, day, week, cell, location, session, offGrid }) {
  const isPast = week < 0;
  const lines = [
    `### Slot: ${label}`,
    `Date: ${dateToken(day, week)}`,
    `Start: ${cell.start}`,
    `End: ${cell.end}`,
    `Location: ${location}`,
  ];
  counts.slots++;

  if (!session) {
    lines.push("Topics:", "");
    counts.empty++;
    out.push(...lines);
    return;
  }

  lines.push(...sessionFieldLines(session, offGrid), "");
  if (!isPast && rand() < 0.4) emitAvailability(lines);
  const entries = discussionFor(session, offGrid, isPast);
  if (entries.length > 0) emitDiscussion(lines, entries);

  out.push(...lines);
}

/** Decide what a base grid slot holds. Past terms are mostly booked; future
 * terms mix booked, pencilled, and open slots. */
function rollSession(isPast, usedThisTerm) {
  const roll = rand();
  if (isPast) {
    if (roll < 0.72)
      return { topic: nextTopic(usedThisTerm), status: "confirmed" };
    if (roll < 0.82)
      return { topic: nextTopic(usedThisTerm), status: "proposed" };
    return null;
  }
  if (roll < 0.33)
    return { topic: nextTopic(usedThisTerm), status: "confirmed" };
  if (roll < 0.7) return { topic: nextTopic(usedThisTerm), status: "proposed" };
  return null;
}

function otherLocation(taken) {
  return pick(LOCATIONS.filter((l) => l !== taken));
}

function emitBaseCells(week, usedThisTerm) {
  const isPast = week < 0;
  const sessionsThisWeek = [];
  for (const cell of CELLS) {
    let session = rollSession(isPast, usedThisTerm);
    // ~6% of sessions are office hours (a host, no topic) instead.
    if (session && rand() < 0.06) {
      session = { officeHours: pick(hosts), status: session.status };
    }
    const location =
      rand() < 0.3 ? otherLocation(cell.location) : cell.location;
    emitSlot({
      label: labelFor(week, cell.day),
      day: cell.day,
      week,
      cell,
      location,
      session,
      offGrid: false,
    });
    if (session) sessionsThisWeek.push({ cell, location });
  }
  return sessionsThisWeek;
}

/** A second session in the same time window, different room. */
function emitParallelBooking(week, usedThisTerm, sessionsThisWeek) {
  const { cell, location } = pick(sessionsThisWeek);
  emitSlot({
    label: labelFor(week, cell.day, "-b"),
    day: cell.day,
    week,
    cell,
    location: otherLocation(location),
    session: {
      topic: nextTopic(usedThisTerm),
      status: week < 0 || rand() < 0.5 ? "confirmed" : "proposed",
    },
    offGrid: false,
  });
}

/** An off-grid proposal: Saturday park slot or a weekday evening. */
function emitOffGrid(week, usedThisTerm) {
  const evening = rand() < 0.5;
  emitSlot({
    label: labelFor(week, evening ? "wed" : "sat", "-og"),
    day: evening ? "wed" : "sat",
    week,
    cell: evening
      ? { start: "18:30", end: "20:00" }
      : { start: "15:00", end: "17:00" },
    location: evening ? "Lounge" : "The Park",
    session: {
      topic: nextTopic(usedThisTerm),
      status: week < 0 ? "confirmed" : "proposed",
    },
    offGrid: true,
  });
}

function emitWeek(week, usedThisTerm) {
  const sessionsThisWeek = emitBaseCells(week, usedThisTerm);
  if (sessionsThisWeek.length > 0 && rand() < 0.15) {
    emitParallelBooking(week, usedThisTerm, sessionsThisWeek);
  }
  if (rand() < 0.06) emitOffGrid(week, usedThisTerm);
}

for (const term of TERMS) {
  const usedThisTerm = new Set();
  for (let week = term.from; week <= term.to; week++) {
    if (term.skip?.includes(week)) continue;
    emitWeek(week, usedThisTerm);
  }
}

// --- splice into the fixture ------------------------------------------------
const notesHeading = "\n## Notes for engineers";
const base = src.includes(MARKER)
  ? src.slice(0, src.indexOf(MARKER)).trimEnd()
  : src.slice(0, src.indexOf(notesHeading)).trimEnd();
const tail = src.slice(src.indexOf(notesHeading));
const next = `${base}\n\n${MARKER}\n\n${out.join("\n").trimEnd()}\n${tail}`;

writeFileSync(FIXTURE, next);
console.log(
  `Wrote ${counts.slots} generated slots (${counts.confirmed} confirmed, ` +
    `${counts.proposed} proposed, ${counts.empty} open) across ${TERMS.length} terms`,
);
