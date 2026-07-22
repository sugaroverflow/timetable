#!/usr/bin/env node
/**
 * One-time (re-runnable) generator that writes seed comments into
 * dev-sample-data.md (QA #42, WS10). Deterministic: same input file +
 * SEED constant → byte-identical output.
 *
 * Volumes (counting hand-authored comments already in the file):
 * - every published topic gets 10–15 comments, some threaded (max depth 3,
 *   matching how deep the feed query fetches replies)
 * - five "mega" topics get 100+ comments with multiple threads
 * - ~40% of published topics get a hosts-only thread
 * - submitted topics (plus a few drafts) get a threaded hosts-only
 *   feedback exchange between an admin and the topic's host
 *
 * Output replaces everything between the GENERATED marker and "## Hearts",
 * so hand-authored comments above the marker are preserved.
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
  "<!-- GENERATED COMMENTS (scripts/generate-seed-comments.mjs) — do not hand-edit below this line -->";
const SEED = 42;

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
      name: m[2].trim(),
      roles: m[3].split(",").map((r) => r.trim()),
    });
}
const electors = people
  .filter((p) => p.roles.includes("elector"))
  .map((p) => p.label);
const hosts = people
  .filter((p) => p.roles.includes("host"))
  .map((p) => p.label);
const admins = people
  .filter((p) => p.roles.includes("admin"))
  .map((p) => p.label);

const topics = [];
{
  const blocks = src.split(/^### Topic:\s*/m).slice(1);
  for (const block of blocks) {
    const label = block.slice(0, block.indexOf("\n")).trim();
    const title = /^Title:\s*(.+)$/m.exec(block)?.[1]?.trim() ?? label;
    const host = /^Host:\s*(.+)$/m.exec(block)?.[1]?.trim();
    const status = /^Status:\s*(.+)$/m.exec(block)?.[1]?.trim();
    if (label && host && status) topics.push({ label, title, host, status });
  }
}

// Hand-authored comments above the marker still count toward per-topic totals.
const handAuthored = src.split(MARKER)[0];
const existingCounts = new Map();
for (const m of handAuthored.matchAll(/^- Topic:\s*(topic-[a-z0-9-]+)$/gm)) {
  existingCounts.set(m[1], (existingCounts.get(m[1]) ?? 0) + 1);
}

// --- text pools ---------------------------------------------------------------
const TOP_LEVEL = [
  "This is exactly the kind of session I was hoping for when I applied.",
  "Would love a practical component to this — hands-on beats slides every time.",
  "I've bumped into this in my own work and never had the vocabulary for it. Count me in.",
  "How much prior knowledge does this assume? Asking as a complete beginner.",
  "Strong yes from me. {title} feels underexplored in this space.",
  "I'd attend this twice if I could.",
  "Could this be paired with a reading list beforehand? I'd like to come prepared.",
  "Honestly lukewarm on this one — I think other topics would serve the cohort better.",
  "This connects directly to what several of us discussed at the last social.",
  "Is there scope to bring in an outside speaker for this?",
  "The framing here is great. Especially keen on the second half of the description.",
  "I work adjacent to this and would happily share some war stories.",
  "Please run this early in the term — it feels foundational for other topics.",
  "I'd love a version of this focused on the UK context specifically.",
  "Neutral on the topic but the host sold it to me at dinner. Hearting.",
  "What would the take-home output be? A framework, a prototype, notes?",
  "This one's been on my mind since the open day. Very keen.",
  "Gentle pushback: is this too broad for a single session?",
  "Would this work as a workshop rather than a talk? I learn better by doing.",
  "Big +1. Also happy to help organise logistics if useful.",
  "I keep coming back to this description. Something about it really lands.",
  "My org tried something in this space last year — happy to do a short show-and-tell.",
  "Can we get a follow-up discussion slot after this one? It'll need digesting.",
  "How does this differ from the similar topic in the feed? Worth clarifying the overlap.",
  "The examples in the description are great — more of those in the session please.",
  "I'd rate this the sleeper hit of the whole feed.",
  "Not my area at all, which is exactly why I want it.",
  "Would be great to hear failure stories, not just successes.",
  "Any chance of pre-circulating materials? Even rough notes help.",
  "I nominated something similar — merging energies would be great.",
];
const REPLIES = [
  "Agreed — and I'd add that the timing matters as much as the content.",
  "I had the opposite reaction, interestingly. Happy to compare notes in person.",
  "This. Exactly this.",
  "Can you say more? I'm not sure I follow the connection.",
  "Seconding the request for something hands-on.",
  "There's a good paper on this — I'll dig out the link and post it.",
  "That matches my experience almost exactly.",
  "Mild disagree: I think the broadness is the point at this stage.",
  "You've convinced me. Changing my vote.",
  "We should form a small reading group around this either way.",
  "+1, and I'd extend that to the whole cluster of related topics.",
  "I read it differently, but your version might make a better session.",
  "Ha, same. Thought I was the only one.",
  "Good question — I'd guess it assumes very little, based on the description.",
  "That show-and-tell offer is worth taking up, host, if you're reading.",
  "Strongly agree with the early-in-term point.",
  "Careful though — last time we scoped something this wide it ate three sessions.",
  "Fair, but I'd rather over-scope and cut than under-scope and pad.",
  "Adding my voice to this thread so it gets noticed in the tally.",
  "Yes — and it pairs naturally with the availability we marked for Thursdays.",
];
const HOST_REPLIES = [
  "Host here — great questions, keep them coming. I'm shaping the outline around this thread.",
  "Noted! I'll build in a practical exercise for exactly this.",
  "No prior knowledge needed — I'll open with a from-zero intro.",
  "Love the show-and-tell offer, let's do it. I'll message you.",
  "Fair point on scope. I'm cutting the middle section and going deeper on the rest.",
  "A reading list is a great shout — I'll post one the week before.",
  "That's the plan: short framing talk, then we work in small groups.",
  "I'll bring the failure stories, don't worry. There are plenty.",
];
const HOST_ONLY = [
  "Hosts: I'd appreciate a co-facilitator for this one — the material benefits from two voices.",
  "Between us — attendance projections for this? Trying to size the room and format.",
  "I'm considering splitting this into two sessions. Thoughts from other hosts?",
  "Anyone have a contact who could guest for ten minutes on the case-study section?",
  "Flagging that my prep time is tight this month — if someone wants to co-own this, say the word.",
  "Host thread: what worked format-wise when you ran discussion-heavy sessions?",
  "I might swap the ordering of this and my other topic. Any scheduling objections?",
];
const HOST_ONLY_REPLIES = [
  "Happy to co-facilitate — I've taught adjacent material before.",
  "Based on the hearts so far you'll fill the big room. Plan for that.",
  "Two sessions feels right. The comment volume supports it.",
  "I can make an intro to exactly the right guest — will connect you.",
  "Ran mine as fishbowl-then-breakouts and it worked well. Steal freely.",
  "No objection to reordering from my side.",
];
const FEEDBACK_OPENERS = [
  "Thanks for submitting this. Before we publish: could you tighten the description and add 2–3 concrete outcomes for attendees?",
  "This is close. The title oversells the scope a little — can you align them and resubmit?",
  "Good bones here. Please add a sentence on prerequisites and expected format so candidates can self-select.",
  "We'd like a clearer connection to the term's theme before publishing — one paragraph would do it.",
];
const FEEDBACK_HOST_REPLIES = [
  "Makes sense — I'll rework the description tonight and resubmit.",
  "Fair. I've drafted a tighter version; does the new framing address the concern?",
  "Added prerequisites and a format note. Let me know if it needs more.",
  "Good push. I've anchored it to the theme explicitly in the first paragraph now.",
];
const FEEDBACK_FOLLOWUPS = [
  "That addresses it — resubmit and I'll publish.",
  "Much better. One tiny thing: fix the typo in the second heading, then it's good to go.",
  "Great, thanks for the quick turnaround.",
];

// --- generation --------------------------------------------------------------
const published = topics.filter((t) => t.status === "published");
const MEGA_PREFERRED = [
  "topic-cryptocurrencies",
  "topic-ai",
  "topic-ai-in-campaigning-2026",
  "topic-digital-deliberative-spaces",
  "topic-knowledge-infrastructure",
];
const megaLabels = new Set(
  MEGA_PREFERRED.filter((l) => published.some((t) => t.label === l)),
);
for (const t of published) {
  if (megaLabels.size >= 5) break;
  megaLabels.add(t.label);
}

const out = [];
function emit({ topic, id, author, visibility, replyTo, text }) {
  out.push(
    `- Topic: ${topic}`,
    `  Comment id: ${id}`,
    `  Author: ${author}`,
    `  Visibility: ${visibility}`,
    ...(replyTo ? [`  Reply to: ${replyTo}`] : []),
    `  Text: ${text}`,
    "",
  );
}

function fill(template, topic) {
  return template.replaceAll("{title}", topic.title);
}

let totalGenerated = 0;
for (const topic of topics) {
  const short = topic.label.replace(/^topic-/, "");
  let n = 0;
  const nextId = () => `c-gen-${short}-${++n}`;

  // Public discussion on published topics
  if (topic.status === "published") {
    const target = megaLabels.has(topic.label)
      ? randInt(100, 115)
      : randInt(10, 15);
    const count = Math.max(0, target - (existingCounts.get(topic.label) ?? 0));
    // pool of {id, depth, author} comments replies can attach to
    const attachable = [];
    for (let i = 0; i < count; i++) {
      const canReply = attachable.length > 0 && rand() < 0.45;
      const parent = canReply
        ? pick(attachable.filter((c) => c.depth < 3))
        : null;
      const isHostVoice = parent && rand() < 0.18;
      let author = isHostVoice
        ? topic.host
        : pick(electors.concat(rand() < 0.12 ? hosts : []));
      if (parent && author === parent.author) author = pick(electors);
      const id = nextId();
      const pool = parent ? (isHostVoice ? HOST_REPLIES : REPLIES) : TOP_LEVEL;
      emit({
        topic: topic.label,
        id,
        author,
        visibility: "public",
        replyTo: parent?.id ?? null,
        text: fill(pick(pool), topic),
      });
      attachable.push({ id, depth: parent ? parent.depth + 1 : 1, author });
      totalGenerated++;
    }

    // Hosts-only side thread on ~40% of published topics
    if (rand() < 0.4) {
      const rootId = nextId();
      emit({
        topic: topic.label,
        id: rootId,
        author: topic.host,
        visibility: "hosts only",
        replyTo: null,
        text: pick(HOST_ONLY),
      });
      totalGenerated++;
      const replyCount = randInt(1, 3);
      let parentId = rootId;
      for (let i = 0; i < replyCount; i++) {
        const author = pick([
          ...admins,
          ...hosts.filter((h) => h !== topic.host),
        ]);
        const id = nextId();
        emit({
          topic: topic.label,
          id,
          author,
          visibility: "hosts only",
          replyTo: parentId,
          text: pick(HOST_ONLY_REPLIES),
        });
        totalGenerated++;
        if (rand() < 0.3) parentId = id; // occasionally deepen the thread
      }
    }
  }

  // Threaded admin feedback on submitted topics (and a few drafts, which
  // represent the post-"request changes" state)
  const wantsFeedback =
    topic.status === "submitted" || (topic.status === "draft" && rand() < 0.2);
  if (wantsFeedback) {
    const admin = pick(admins);
    const fbId = nextId();
    emit({
      topic: topic.label,
      id: fbId,
      author: admin,
      visibility: "admins only",
      replyTo: null,
      text: pick(FEEDBACK_OPENERS),
    });
    const replyId = nextId();
    emit({
      topic: topic.label,
      id: replyId,
      author: topic.host,
      visibility: "admins only",
      replyTo: fbId,
      text: pick(FEEDBACK_HOST_REPLIES),
    });
    emit({
      topic: topic.label,
      id: nextId(),
      author: admin,
      visibility: "admins only",
      replyTo: replyId,
      text: pick(FEEDBACK_FOLLOWUPS),
    });
    totalGenerated += 3;
  }
}

// --- splice into the fixture ---------------------------------------------------
const heartsHeading = "\n## Hearts";
let base;
if (src.includes(MARKER)) {
  base = src.slice(0, src.indexOf(MARKER)).trimEnd();
} else {
  base = src.slice(0, src.indexOf(heartsHeading)).trimEnd();
}
const tail = src.slice(src.indexOf(heartsHeading));
const next = `${base}\n\n${MARKER}\n\n${out.join("\n").trimEnd()}\n${tail}`;

writeFileSync(FIXTURE, next);
console.log(
  `Wrote ${totalGenerated} generated comments (${megaLabels.size} mega topics: ${[...megaLabels].join(", ")})`,
);
