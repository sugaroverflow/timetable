/**
 * Sample-digest fixture data (housekeeping 2026-08-13: moved out of
 * email.ts so 600+ lines of example content don't live in the production
 * email module). The "Send test digest" button renders exactly this
 * through the real renderDigest pipeline; every activity kind appears,
 * filtered against the forum's configured per-kind defaults so admins
 * preview what a default member's digest carries.
 */
import type {
  DigestActivity,
  DigestComment,
  DigestPerson,
  DigestTopicCard,
  ForumDigest,
} from "@timetable/core";
import {
  isDigestKindEnabled,
  type DigestKind,
  type DigestKinds,
} from "@timetable/shared";

type SamplePath = (host: string, topic: string) => string;
const sWho = (name: string, userId: string): DigestPerson => ({
  name,
  userId,
  image: null,
});
const sC = (
  id: string,
  parentId: string | null,
  author: DigestPerson,
  body: string,
): DigestComment => ({ id, parentId, author, body });
const sAt = (iso: string): Date => new Date(iso);
const sReply = (
  visibility: "public" | "host_only" | "admin_only",
  comment: DigestComment,
  ancestors: DigestComment[],
  iso: string,
): DigestActivity => ({
  kind: "reply",
  visibility,
  comment,
  ancestors,
  at: sAt(iso),
});
const sComment = (
  visibility: "public" | "host_only" | "admin_only",
  comment: DigestComment,
  iso: string,
): DigestActivity => ({
  kind: "comment",
  visibility,
  comment,
  ancestors: [],
  at: sAt(iso),
});

/** One sample card's identity, shared by its activities. */
type SampleCardMeta = {
  topicId: string;
  title: string;
  author: DigestPerson;
  body: string | null;
  path: string | null;
};

/** A sample activity tagged with the switch that governs it — null for
 * the admin overrides (own-topic sessions, assignments) that are always
 * shown. */
type SampleActivity = {
  meta: SampleCardMeta;
  kind: DigestKind | null;
  activity: DigestActivity;
};

/** Every card-borne example, several per kind, in display order. The
 * test digest filters these against the forum's configured defaults so
 * admins preview exactly what a default member's digest carries. */
// eslint-disable-next-line max-lines-per-function -- sample DATA, not logic
function sampleActivities(
  me: DigestPerson,
  p: SamplePath,
  forumId: string,
): SampleActivity[] {
  const marcus = sWho("Marcus Webb", "sample-marcus");
  const leila = sWho("Leila Haddad", "sample-leila");
  const mine: SampleCardMeta = {
    topicId: "sample-mine",
    title: "Rethinking the weekly assembly format",
    author: me,
    body: null,
    path: p("you", "weekly-assembly"),
  };
  const rcv: SampleCardMeta = {
    topicId: "sample-rcv",
    title: "Should we adopt ranked-choice for our elections?",
    author: marcus,
    body: null,
    path: p("marcus", "ranked-choice"),
  };
  const garden: SampleCardMeta = {
    topicId: "sample-garden",
    title: "A community garden for the north courtyard",
    author: sWho("Priya Okafor", "sample-priya"),
    body: null,
    path: p("priya", "community-garden"),
  };
  const safety: SampleCardMeta = {
    topicId: "sample-safety",
    title: "Fire safety training for session hosts",
    author: sWho("Eli Morgan", "sample-eli"),
    body: null,
    path: p("eli", "fire-safety-training"),
  };
  const teachin: SampleCardMeta = {
    topicId: "sample-teachin",
    title: "A civic data teach-in for local groups",
    author: sWho("Jordan Lee", "sample-jordan"),
    body: null,
    path: p("jordan", "civic-data-teach-in"),
  };

  const session = (
    meta: SampleCardMeta,
    slotId: string,
    startIso: string,
    endIso: string,
    location: string,
    url: string,
    isNew: boolean,
  ): DigestActivity => ({
    kind: "session",
    session: {
      slotId,
      startsAt: sAt(startIso),
      endsAt: sAt(endIso),
      location,
      url,
      topicId: meta.topicId,
      topicTitle: meta.title,
      timetableId: forumId,
      updatedAt: sAt("2026-07-30T09:00:00Z"),
      isNew,
    },
    at: sAt("2026-07-30T09:00:00Z"),
  });

  const rcvThread = [
    sC(
      "rcv-marcus",
      null,
      marcus,
      "I've sketched three options below — keen to hear which people prefer.",
    ),
    sC(
      "rcv-you",
      "rcv-marcus",
      me,
      "Option B seems fairest to the smaller working groups.",
    ),
  ];
  const leilaReply = sC(
    "rcv-leila",
    "rcv-you",
    leila,
    "Agreed — though Option B needs a quorum rule to be safe.",
  );

  return [
    // --- Your own topic: an admin scheduled it (always shown) ---
    {
      meta: mine,
      kind: null,
      activity: session(
        mine,
        "sample-slot-mine",
        "2026-08-06T19:00:00Z",
        "2026-08-06T22:00:00Z",
        "Classroom",
        "",
        true,
      ),
    },
    // --- Comments on your topics ---
    {
      meta: mine,
      kind: "comments",
      activity: sComment(
        "public",
        sC(
          "assembly-sam",
          null,
          sWho("Sam Whitfield", "sample-sam"),
          "This is exactly what we've needed — could we pair it with the newcomers session?",
        ),
        "2026-07-30T08:40:00Z",
      ),
    },
    {
      meta: mine,
      kind: "comments",
      activity: sComment(
        "host_only",
        sC(
          "assembly-eli",
          null,
          sWho("Eli Morgan", "sample-eli"),
          "Between us hosts — shall we trial it at the next session before proposing it more widely?",
        ),
        "2026-07-30T08:10:00Z",
      ),
    },
    // --- The you-and-admin drafting thread rides the comments switch ---
    {
      meta: mine,
      kind: "comments",
      activity: sComment(
        "admin_only",
        sC(
          "assembly-fatima",
          null,
          sWho("Fatima Noor", "sample-fatima"),
          "Draft note: tighten the opening paragraph before this goes to a vote.",
        ),
        "2026-07-30T07:58:00Z",
      ),
    },
    {
      meta: mine,
      kind: "comments",
      activity: sComment(
        "admin_only",
        sC(
          "assembly-fatima-2",
          "assembly-fatima",
          sWho("Fatima Noor", "sample-fatima"),
          "…and once that's in, I'm happy to publish it straight away.",
        ),
        "2026-07-30T08:02:00Z",
      ),
    },
    // --- ❤️s and 💙s on your topics ---
    {
      meta: mine,
      kind: "hearts",
      activity: {
        kind: "heart",
        hearters: [
          sWho("Amara Okafor", "sample-amara"),
          sWho("Tariq Hassan", "sample-tariq"),
          sWho("Rosa Delgado", "sample-rosa"),
          sWho("Ben Fletcher", "sample-ben"),
          sWho("Maya Iyer", "sample-maya"),
          sWho("Kwame Mensah", "sample-kwame"),
        ],
        at: sAt("2026-07-30T07:55:00Z"),
      },
    },
    {
      meta: mine,
      kind: "hostHearts",
      activity: {
        kind: "hostHeart",
        hearters: [
          sWho("Eli Morgan", "sample-eli"),
          sWho("Zara Ashworth", "sample-zara"),
        ],
        at: sAt("2026-07-30T07:50:00Z"),
      },
    },
    // --- A topic you ❤️'d: confirmed session + the reply thread ---
    {
      meta: rcv,
      kind: "sessions",
      activity: session(
        rcv,
        "sample-slot-confirmed",
        "2026-08-04T18:00:00Z",
        "2026-08-04T20:00:00Z",
        "Classroom",
        "https://lu.ma/sample-rcv",
        true,
      ),
    },
    {
      meta: rcv,
      kind: "replies",
      activity: sReply("public", leilaReply, rcvThread, "2026-07-30T10:05:00Z"),
    },
    {
      meta: rcv,
      kind: "replies",
      activity: sReply(
        "public",
        sC(
          "rcv-daniel",
          "rcv-you",
          sWho("Daniel Osei", "sample-daniel"),
          "B also handles ties better than A did last year.",
        ),
        rcvThread,
        "2026-07-30T10:22:00Z",
      ),
    },
    {
      meta: rcv,
      kind: "replies",
      activity: sReply(
        "public",
        sC(
          "rcv-sofia",
          "rcv-leila",
          sWho("Sofia Russo", "sample-sofia"),
          "A two-thirds quorum? That worked well for us last spring.",
        ),
        [...rcvThread, leilaReply],
        "2026-07-30T10:40:00Z",
      ),
    },
    // --- Comments on topics you ❤️'d ---
    {
      meta: garden,
      kind: "commentsHearted",
      activity: sComment(
        "public",
        sC(
          "garden-jordan",
          null,
          sWho("Jordan Lee", "sample-jordan"),
          "Should we use raised beds or dig straight into the ground?",
        ),
        "2026-07-30T09:02:00Z",
      ),
    },
    {
      meta: garden,
      kind: "commentsHearted",
      activity: sComment(
        "public",
        sC(
          "garden-robin",
          null,
          sWho("Robin Vale", "sample-robin"),
          "Count me in — I can bring tools on the first weekend.",
        ),
        "2026-07-30T09:12:00Z",
      ),
    },
    // --- A topic you 💙'd: comments + an upcoming session ---
    {
      meta: safety,
      kind: "sessionsHostHearted",
      activity: session(
        safety,
        "sample-slot-safety",
        "2026-08-12T19:00:00Z",
        "2026-08-12T21:00:00Z",
        "Hall",
        "",
        true,
      ),
    },
    {
      meta: safety,
      kind: "commentsHostHearted",
      activity: sComment(
        "public",
        sC(
          "safety-nadia",
          null,
          sWho("Nadia Osman", "sample-nadia"),
          "Can we cover the new extinguisher points by the stage too?",
        ),
        "2026-07-30T09:30:00Z",
      ),
    },
    {
      meta: safety,
      kind: "commentsHostHearted",
      activity: sComment(
        "host_only",
        sC(
          "safety-zara",
          null,
          sWho("Zara Ashworth", "sample-zara"),
          "Hosts — bring your session risk sheets, we'll review them together.",
        ),
        "2026-07-30T09:45:00Z",
      ),
    },
    // --- Comments that @mention you ---
    {
      meta: teachin,
      kind: "mentions",
      activity: sComment(
        "public",
        sC(
          "teachin-jordan",
          null,
          sWho("Jordan Lee", "sample-jordan"),
          `@${me.name ?? "You"} — you ran something like this last year, any pitfalls to avoid?`,
        ),
        "2026-07-30T11:15:00Z",
      ),
    },
    {
      meta: teachin,
      kind: "mentions",
      activity: sComment(
        "public",
        sC(
          "teachin-hana",
          "teachin-jordan",
          sWho("Hana Kim", "sample-hana"),
          `Seconding that — @${me.name ?? "You"}'s slide pack would be a great starting point.`,
        ),
        "2026-07-30T11:32:00Z",
      ),
    },
  ];
}

/** The status cards (assigned / new / ready-to-review / draft), tagged
 * like the activities — several per kind. */
function sampleStatusActivities(
  me: DigestPerson,
  p: SamplePath,
): SampleActivity[] {
  const card = (
    topicId: string,
    title: string,
    author: DigestPerson,
    body: string,
    path: string | null,
  ): SampleCardMeta => ({ topicId, title, author, body, path });
  return [
    // Assigned to you — an admin override, always shown.
    {
      meta: card(
        "sample-assigned",
        "Welcome newcomers session",
        me,
        "A short, warm session for people in their first month: how the forum works, how topics get proposed and chosen, and who to ask for help. Ideally run monthly, thirty minutes, with two hosts.",
        p("you", "welcome-newcomers"),
      ),
      kind: null,
      activity: { kind: "assignment", at: sAt("2026-07-29T18:20:00Z") },
    },
    // Newly published topics (elector and host flavours share the look).
    {
      meta: card(
        "sample-new",
        "Open data standards for local councils",
        sWho("Hana Kim", "sample-hana"),
        "Councils publish the same kinds of data — budgets, planning applications, service performance — in wildly different shapes, which makes it almost impossible to compare across areas or build tools that work in more than one place. This topic proposes we back a small, shared schema for the handful of datasets that matter most.",
        p("hana", "open-data-standards"),
      ),
      kind: "newTopics",
      activity: { kind: "new", at: sAt("2026-07-29T16:00:00Z") },
    },
    {
      meta: card(
        "sample-new-host",
        "Reading group: seeing like a state",
        sWho("Zara Ashworth", "sample-zara"),
        "Four sessions over the term, one part of the book each — with the last session inviting everyone to bring one story of a legibility failure from their own council or workplace.",
        p("zara", "reading-group-state"),
      ),
      kind: "newTopicsHost",
      activity: { kind: "new", at: sAt("2026-07-29T17:10:00Z") },
    },
    // Ready to review (admins).
    {
      meta: card(
        "sample-pending-1",
        "A repair café for the winter term",
        sWho("Noah Patel", "sample-noah"),
        "Monthly, in the Classroom, with the tools cupboard unlocked: bring a broken thing, leave with a fixed one — and a running tally of what we saved from landfill.",
        p("noah", "repair-cafe"),
      ),
      kind: "pendingReview",
      activity: {
        kind: "pending",
        at: sAt("2026-07-30T12:05:00Z"),
        isNew: true,
      },
    },
    {
      meta: card(
        "sample-pending-2",
        "Digital security drop-in hours",
        sWho("Sadie Mercer", "sample-sadie"),
        "A standing fortnightly hour for anyone to bring a device, an account, or a worry. No agenda, no judgement, tea provided.",
        p("sadie", "security-drop-in"),
      ),
      kind: "pendingReview",
      activity: {
        kind: "pending",
        at: sAt("2026-07-30T12:40:00Z"),
        isNew: false,
      },
    },
    // Your lingering drafts.
    {
      meta: card(
        "sample-draft",
        "Half-finished idea about peer mentoring",
        me,
        "Pair each new member with someone a few months ahead of them — not a mentor exactly, just a first point of contact. Still need to work out how we match people and how light-touch to keep it.",
        p("you", "peer-mentoring"),
      ),
      kind: "drafts",
      activity: { kind: "draft", at: sAt("2026-07-20T10:00:00Z") },
    },
  ];
}

/** Assemble tagged sample activities into cards, keeping only those the
 * forum's defaults allow (null-kind admin overrides always survive), in
 * first-appearance order. */
function assembleSampleCards(
  samples: SampleActivity[],
  allowed: (kind: DigestKind | null) => boolean,
): DigestTopicCard[] {
  const cards = new Map<string, DigestTopicCard>();
  for (const sample of samples) {
    if (!allowed(sample.kind)) continue;
    const existing = cards.get(sample.meta.topicId);
    if (existing) {
      existing.activities.push(sample.activity);
      continue;
    }
    cards.set(sample.meta.topicId, {
      ...sample.meta,
      activities: [sample.activity],
    });
  }
  return [...cards.values()];
}

/**
 * Example digest for the Forum Settings "Send test digest" button — the
 * real renderer over invented-but-plausible content, several examples of
 * every activity type. Pass the forum's configured kind defaults and the
 * digest carries exactly what a default member's would (admin overrides —
 * your-topic sessions, assignments — always included); omit them for the
 * full showcase.
 */
export function sampleDigest(args: {
  email: string;
  name: string | null;
  forumId: string;
  forumName: string;
  forumSlug: string;
  accent?: string | null;
  kindDefaults?: DigestKinds;
}): ForumDigest {
  const me = sWho(args.name ?? "You", "sample-you");
  const p: SamplePath = (host, topic) =>
    `/f/${args.forumSlug}/${host}/${topic}`;
  const allowed = (kind: DigestKind | null) =>
    kind === null || isDigestKindEnabled(null, kind, args.kindDefaults);
  return {
    userId: "sample-you",
    email: args.email,
    name: args.name,
    forumId: args.forumId,
    forumName: args.forumName,
    forumSlug: args.forumSlug,
    accent: args.accent ?? null,
    hostLabel: "Host",
    adminLabel: "Admin",
    topics: assembleSampleCards(
      [
        ...sampleActivities(me, p, args.forumId),
        ...sampleStatusActivities(me, p),
      ],
      allowed,
    ),
    availabilityAsks: allowed("availabilityAsks")
      ? [
          {
            slotId: "sample-slot-proposed",
            startsAt: sAt("2026-08-08T09:00:00Z"),
            endsAt: sAt("2026-08-08T10:30:00Z"),
            location: "The Park",
            url: "",
            topicId: "sample-garden",
            topicTitle: "A community garden for the north courtyard",
            timetableId: args.forumId,
            updatedAt: sAt("2026-07-30T11:00:00Z"),
            isNew: true,
          },
          {
            slotId: "sample-slot-proposed-2",
            startsAt: sAt("2026-08-11T19:00:00Z"),
            endsAt: sAt("2026-08-11T22:00:00Z"),
            location: "Drawing Room",
            url: "",
            topicId: "sample-rcv",
            topicTitle: "Should we adopt ranked-choice for our elections?",
            timetableId: args.forumId,
            updatedAt: sAt("2026-07-30T11:20:00Z"),
            isNew: true,
          },
        ]
      : [],
    newSlots: allowed("slotReleases")
      ? [
          {
            startsAt: sAt("2026-08-14T19:00:00Z"),
            endsAt: sAt("2026-08-14T22:00:00Z"),
            locations: ["Hall"],
            timetableId: args.forumId,
          },
          {
            startsAt: sAt("2026-08-15T16:00:00Z"),
            endsAt: sAt("2026-08-15T18:00:00Z"),
            locations: ["Hall", "Classroom"],
            timetableId: args.forumId,
          },
          {
            startsAt: sAt("2026-08-17T19:00:00Z"),
            endsAt: sAt("2026-08-17T22:00:00Z"),
            locations: ["Classroom"],
            timetableId: args.forumId,
          },
        ]
      : [],
    newMembers: allowed("newMembers")
      ? [
          sWho("Priya Narayan", "sample-priya-n"),
          sWho("Oscar Lindqvist", "sample-oscar"),
          sWho("Grace Adeyemi", "sample-grace"),
        ]
      : [],
  };
}
