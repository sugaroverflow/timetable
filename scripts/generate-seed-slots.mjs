#!/usr/bin/env node
/**
 * Re-runnable generator that writes a multi-year calendar history into the
 * Timeslots section of dev-sample-data.md. Deterministic for a given run
 * date: same input file + SEED constant + calendar date → identical output.
 *
 * House schedule (2026-08-11, realistic): two real-dated terms per academic
 * year — the WINTER term (20 Sep – first Sunday of December) and the SPRING
 * term (Monday on/after 12 Jan – first Sunday of April) — emitted with
 * absolute YYYY-MM-DD dates, six terms spanning roughly two years back to
 * one ahead of the run date. The hand-authored current-window slots (the
 * relative-dated summer specials) live above the marker and are preserved.
 *
 * Times: 19:00–22:00 every evening, plus 16:00–18:00 weekend afternoons.
 * Rooms: the Classroom is available every day except Wednesday; the Drawing
 * Room on Tuesdays and Thursdays; the Hall for ONE week per month (the
 * Mon-start week containing the 15th), every day that week. Hall slots are
 * emitted Off-grid so the derived weekly pattern never learns the Hall —
 * hall weeks read as deliberate one-off releases, and open hall slots are
 * the "when is the hall free?" QA data. A slot's other rooms ride as bare
 * companion sections (same time window, different location — the seed
 * merges them onto one timeslot offering the union of locations).
 *
 * Content: past terms are mostly booked (confirmed, Luma URLs), future
 * terms mix booked, pencilled (proposed, some with claim comments and
 * frozen 🟢🟡🔴 counts), and open slots. Sprinkled on top: parallel
 * bookings in the Drawing Room or Hall, office-hours sessions, and rare
 * off-grid park afternoons.
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

// --- calendar arithmetic (all UTC) ------------------------------------------
const DAY_MS = 24 * 60 * 60 * 1000;
const TODAY = new Date(
  Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  ),
);

const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * DAY_MS);
/** The Monday starting d's week. */
const monday = (d) => addDays(d, -((d.getUTCDay() + 6) % 7));

/** First given weekday (0=Sun..6) on/after a date. */
function nextWeekday(d, weekday) {
  return addDays(d, (weekday - d.getUTCDay() + 7) % 7);
}

/** Winter term: 20 Sep – first Sunday of December. */
function winterTerm(year) {
  return {
    tag: `w${String(year).slice(2)}`,
    start: new Date(Date.UTC(year, 8, 20)),
    end: nextWeekday(new Date(Date.UTC(year, 11, 1)), 0),
  };
}
/** Spring term: Monday on/after 12 Jan – first Sunday of April. */
function springTerm(year) {
  return {
    tag: `s${String(year).slice(2)}`,
    start: nextWeekday(new Date(Date.UTC(year, 0, 12)), 1),
    end: nextWeekday(new Date(Date.UTC(year, 3, 1)), 0),
  };
}

const Y = TODAY.getUTCFullYear();
const TERMS = [
  winterTerm(Y - 2),
  springTerm(Y - 1),
  winterTerm(Y - 1),
  springTerm(Y),
  winterTerm(Y),
  springTerm(Y + 1),
].sort((a, b) => a.start - b.start);

/** Hall week: the Mon-start week containing the 15th of some month. */
function isHallWeek(d) {
  const mon = monday(d);
  for (let i = 0; i < 7; i++) {
    if (addDays(mon, i).getUTCDate() === 15) return true;
  }
  return false;
}

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
  "Proposing an extra afternoon outside the usual grid.",
  "Weekend experiment: same format, different energy. Who's in?",
];
const HALL_RELEASE_TEXTS = [
  "Hall week — the big room is open every day this week. Claim away.",
  "The Hall is released for this week; first topics to claim it get it.",
  "Hall available all week — good for anything expecting a crowd.",
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

function discussionFor({ topic, officeHours, status }, kind, isPast) {
  if (officeHours) return [{ author: officeHours, text: pick(OFFICE_HOURS) }];
  if (kind === "park")
    return [{ author: topic.host, text: pick(OFF_GRID_TEXTS) }];
  return sessionDiscussion({ isPast, status, topic });
}

/**
 * Emit one slot block. session: null (open slot) or
 * {topic} / {officeHours: hostLabel}, plus status.
 */
function emitSlot({ label, date, cell, location, session, offGrid, kind }) {
  const isPast = date < TODAY;
  const lines = [
    `### Slot: ${label}`,
    `Date: ${ymd(date)}`,
    `Start: ${cell.start}`,
    `End: ${cell.end}`,
    `Location: ${location}`,
  ];
  counts.slots++;

  if (!session) {
    lines.push("Topics:");
    if (offGrid) lines.push("Off-grid: yes");
    lines.push("");
    counts.empty++;
    out.push(...lines);
    return;
  }

  lines.push(...sessionFieldLines(session, offGrid), "");
  if (!isPast && rand() < 0.4) emitAvailability(lines);
  const entries = discussionFor(session, kind, isPast);
  if (entries.length > 0) emitDiscussion(lines, entries);

  out.push(...lines);
}

/** Decide what a base slot holds. Past terms are mostly booked; future
 * terms mix booked, pencilled, and open slots. */
function rollSession(isPast, usedThisTerm) {
  const roll = rand();
  if (isPast) {
    if (roll < 0.6)
      return { topic: nextTopic(usedThisTerm), status: "confirmed" };
    if (roll < 0.7)
      return { topic: nextTopic(usedThisTerm), status: "proposed" };
    return null;
  }
  if (roll < 0.25)
    return { topic: nextTopic(usedThisTerm), status: "confirmed" };
  if (roll < 0.55)
    return { topic: nextTopic(usedThisTerm), status: "proposed" };
  return null;
}

const EVENING = { start: "19:00", end: "22:00" };
const AFTERNOON = { start: "16:00", end: "18:00" };

/** The Classroom, or the Hall on hall-week Wednesdays — Hall slots are
 * Off-grid so the Hall never shapes the weekly pattern. */
function emitPrimary(ctx, cell, aft) {
  let session = rollSession(ctx.isPast, ctx.usedThisTerm);
  if (session && rand() < 0.06) {
    session = { officeHours: pick(hosts), status: session.status };
  }
  emitSlot({
    label: `slot-g${ctx.tag}-${ctx.mmdd}${aft}`,
    date: ctx.date,
    cell,
    location: ctx.classroom ? "Classroom" : "Hall",
    session,
    offGrid: !ctx.classroom,
  });
}

/** Drawing Room companion (Tue/Thu evenings): part of the weekly grid;
 * sometimes a parallel booking, else an open second room. */
function emitDrawingRoom(ctx, cell) {
  const book = rand() < (ctx.isPast ? 0.3 : 0.18);
  emitSlot({
    label: `slot-g${ctx.tag}-${ctx.mmdd}-dr`,
    date: ctx.date,
    cell,
    location: "Drawing Room",
    session: book
      ? {
          topic: nextTopic(ctx.usedThisTerm),
          status: ctx.isPast || rand() < 0.5 ? "confirmed" : "proposed",
        }
      : null,
    offGrid: false,
  });
}

/** One admin "hall week" note per future hall week, on its first open
 * evening slot. */
function emitHallRelease(ctx, cell, label) {
  counts.slots++;
  counts.empty++;
  out.push(
    `### Slot: ${label}`,
    `Date: ${ymd(ctx.date)}`,
    `Start: ${cell.start}`,
    `End: ${cell.end}`,
    `Location: Hall`,
    "Topics:",
    "Off-grid: yes",
    "",
    "Discussion:",
    `- Author: admin-edwin`,
    `  Text: ${pick(HALL_RELEASE_TEXTS)}`,
    "",
  );
}

/** Hall companion during hall weeks: mostly OPEN — free hall dates are the
 * point — with the odd booked event; always Off-grid. */
function emitHallCompanion(ctx, cell, aft) {
  const book = rand() < (ctx.isPast ? 0.25 : 0.08);
  const session = book
    ? {
        topic: nextTopic(ctx.usedThisTerm),
        status: ctx.isPast ? "confirmed" : "proposed",
      }
    : null;
  const label = `slot-g${ctx.tag}-${ctx.mmdd}${aft}-hall`;
  const announce =
    !session && !ctx.announced.done && cell === EVENING && !ctx.isPast;
  if (announce) {
    ctx.announced.done = true;
    emitHallRelease(ctx, cell, label);
    return;
  }
  emitSlot({
    label,
    date: ctx.date,
    cell,
    location: "Hall",
    session,
    offGrid: true,
  });
}

/** Rare off-grid park afternoon (Saturdays, its own 15:00 window so it
 * can never collide with a grid (time, location) pair on reseed). */
function emitParkExtra(ctx) {
  emitSlot({
    label: `slot-g${ctx.tag}-${ctx.mmdd}-og`,
    date: ctx.date,
    cell: { start: "15:00", end: "17:00" },
    location: "The Park",
    session: {
      topic: nextTopic(ctx.usedThisTerm),
      status: ctx.isPast ? "confirmed" : "proposed",
    },
    offGrid: true,
    kind: "park",
  });
}

/** All rooms of one time window: primary + companions. */
function emitCell(ctx, cell) {
  const aft = cell === AFTERNOON ? "-aft" : "";
  emitPrimary(ctx, cell, aft);
  if (ctx.drawingRoom && cell === EVENING) emitDrawingRoom(ctx, cell);
  if (ctx.hall && ctx.classroom) emitHallCompanion(ctx, cell, aft);
}

/** One day of a term: primary slot per cell + room companions. */
function emitDay(term, date, usedThisTerm, announced) {
  const weekday = date.getUTCDay();
  const hall = isHallWeek(date);
  const classroom = weekday !== 3;
  if (!classroom && !hall) return; // Wednesday outside hall weeks: no rooms.

  const ctx = {
    tag: term.tag,
    date,
    mmdd: ymd(date).slice(5).replace("-", ""),
    isPast: date < TODAY,
    classroom,
    hall,
    drawingRoom: weekday === 2 || weekday === 4,
    usedThisTerm,
    announced,
  };
  const weekend = weekday === 0 || weekday === 6;
  for (const cell of weekend ? [AFTERNOON, EVENING] : [EVENING]) {
    emitCell(ctx, cell);
  }

  if (weekday === 6 && rand() < 0.04) emitParkExtra(ctx);
}

for (const term of TERMS) {
  const usedThisTerm = new Set();
  let weekKey = "";
  let announced = { done: true };
  for (let d = term.start; d <= term.end; d = addDays(d, 1)) {
    const mon = ymd(monday(d));
    if (mon !== weekKey) {
      weekKey = mon;
      announced = { done: false };
    }
    emitDay(term, d, usedThisTerm, announced);
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
    `${counts.proposed} proposed, ${counts.empty} open) across ${TERMS.length} terms: ` +
    TERMS.map((t) => `${t.tag} ${ymd(t.start)}..${ymd(t.end)}`).join(", "),
);
