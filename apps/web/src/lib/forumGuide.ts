import {
  calendarConfirmPolicy,
  canHostHeart,
  isAdmin,
  isCalendarEnabled,
  isElector,
  isHost,
  isHostCommentsEnabled,
  type Role,
  type TimetableSettings,
} from "@timetable/shared";

import { pluralLabel, roleLabel } from "@/lib/timetableSettings";

/**
 * forum-guide (2026-09-30): the "How it works" page's content, built for
 * the viewer — only the roles they hold, only the features this forum has
 * switched on, and in the forum's own role labels. Pure so the copy rules
 * are unit-tested; the page just renders it. Every step names the real
 * control and links to the page it lives on, so the guide is a map of the
 * app rather than a second description of it (docs/PRODUCT.md is that).
 *
 * Copy rule inherited from demand-first scheduling: a ❤️ implies "I'd
 * attend", but that is never stated in UI copy — don't add it here.
 */

export type GuideStep = {
  title: string;
  body: string;
  href?: string;
  linkLabel?: string;
};

export type GuideSection = {
  id: "elector" | "host" | "admin" | "loop" | "visitor";
  heading: string;
  steps: GuideStep[];
};

export type ForumGuide = {
  /** One paragraph: what this forum is for, in its own role names. */
  summary: string;
  sections: GuideSection[];
};

export type ForumGuideInput = {
  /** `/f/<slug>` */
  base: string;
  roles: readonly Role[];
  settings: TimetableSettings;
  isAuthed: boolean;
  /** Whether the Calendar nav link shows for this viewer (the layout's
   * calendarNavVisible) — the guide never points at a page you can't see. */
  calendarVisible: boolean;
};

/** Everything the section builders share: the input plus the forum's
 * role labels, lower-case plural for use mid-sentence. */
type Ctx = ForumGuideInput & {
  hosts: string;
  electors: string;
  admins: string;
  calendarOn: boolean;
};

export function buildForumGuide(input: ForumGuideInput): ForumGuide {
  const labels = input.settings.roleLabels;
  const plural = (role: string) =>
    pluralLabel(roleLabel(labels, role)).toLowerCase();
  const ctx: Ctx = {
    ...input,
    hosts: plural("host"),
    electors: plural("elector"),
    admins: plural("admin"),
    calendarOn: isCalendarEnabled(input.settings),
  };

  const summary =
    `${cap(ctx.hosts)} propose topics they could run a session on. ` +
    `${cap(ctx.electors)} read them and ❤️ the ones they want most. ` +
    (ctx.calendarOn
      ? `The most-wanted topics become sessions on the calendar, at times people can make.`
      : `${cap(ctx.admins)} use that demand to decide what happens.`);

  const { roles } = input;
  if (roles.length === 0) return { summary, sections: [visitorSection(ctx)] };

  const sections = [
    isElector(roles) ? electorSection(ctx) : null,
    isHost(roles) ? hostSection(ctx) : null,
    isAdmin(roles) ? adminSection(ctx) : null,
    loopSection(ctx),
  ].filter((s): s is GuideSection => s !== null);
  return { summary, sections };
}

function heading(ctx: Ctx, role: string): string {
  return `For ${pluralLabel(roleLabel(ctx.settings.roleLabels, role))}`;
}

function visitorSection({ base, isAuthed, admins }: Ctx): GuideSection {
  return {
    id: "visitor",
    heading: "Reading as a visitor",
    steps: [
      {
        title: "Look around",
        body: "You can read what this forum makes public. Taking part — ❤️s, comments, topics — is for members.",
        href: `${base}/topics`,
        linkLabel: "All Topics",
      },
      isAuthed
        ? {
            title: "Joining",
            body: `Membership is by invitation: ask one of the forum's ${admins} to add you.`,
          }
        : {
            title: "Joining",
            body: "Membership is by invitation. If you've been invited, sign in with the email address the invite went to.",
            href: "/sign-in",
            linkLabel: "Sign in",
          },
    ],
  };
}

function electorSection(ctx: Ctx): GuideSection {
  const { base, hosts } = ctx;
  const steps: GuideStep[] = [
    {
      title: "Work through the Topic Queue",
      body: "One topic at a time, in a shuffled order, until you've seen them all. ❤️ it or move on to the next. Arrow keys work too: ↑ ❤️, ↓ comment, ← back, → next.",
      href: `${base}/queue`,
      linkLabel: "Topic Queue",
    },
    {
      title: "Choose your ❤️s",
      body: "❤️s are weighted: the more topics you ❤️, the less each one counts, so save them for the ones you care about. You can change your mind any time.",
      href: `${base}/topics?hearted=me`,
      linkLabel: "❤️ Topics",
    },
    {
      title: "Join the discussion",
      body: `Ask questions and suggest angles in a topic's comments — ${hosts} read them.`,
      href: `${base}/topics`,
      linkLabel: "All Topics",
    },
  ];
  if (ctx.calendarVisible) {
    steps.push({
      title: "Say when you're free",
      body: "Paint your weekly pattern once, then answer 🟢🟡🔴 on any time that differs. Topic cards show a Sessions tab once a time is pencilled in.",
      href: `${base}/calendar`,
      linkLabel: "Calendar",
    });
  }
  return { id: "elector", heading: heading(ctx, "elector"), steps };
}

function hostSection(ctx: Ctx): GuideSection {
  const { base, settings, hosts, electors, admins } = ctx;
  const hostOnlyTab = isHostCommentsEnabled(settings)
    ? `, plus a tab only ${hosts} and ${admins} can read`
    : "";
  const steps: GuideStep[] = [
    {
      title: "Write a topic",
      body: `Press New topic on My Topics. It starts as a draft that only you and the ${admins} can see; its Drafting tab is where you talk it over with them.`,
      href: `${base}/my-topics`,
      linkLabel: "My Topics",
    },
    settings.topics?.hostsPublishDirectly
      ? {
          title: "Publish it",
          body: `When it's ready, publish it yourself — ${electors} see it straight away.`,
        }
      : {
          title: "Mark it ready",
          body: `Flip Ready to publish when you're done writing. The ${admins} publish it, and ${electors} see it from then on.`,
        },
    {
      title: "See the response",
      body: `Your My Topics cards show each topic's ❤️s and comments${hostOnlyTab}. Analysis compares every topic.`,
      href: `${base}/analysis`,
      linkLabel: "Analysis",
    },
  ];
  if (
    canHostHeart({ userId: ctx.isAuthed ? "viewer" : null, roles: ctx.roles })
  ) {
    const elector = roleLabel(settings.roleLabels, "elector").toLowerCase();
    const host = roleLabel(settings.roleLabels, "host").toLowerCase();
    steps.push({
      title: "💙 colleagues' topics",
      body: `As a non-${elector}, your gesture is 💙: it tells the ${host} you're interested, and never counts in the ${electors}' vote.`,
      href: `${base}/topics?hearted=host`,
      linkLabel: "💙 Topics",
    });
  }
  if (ctx.calendarOn) steps.push(hostSchedulingStep(ctx));
  return { id: "host", heading: heading(ctx, "host"), steps };
}

function hostSchedulingStep({ base, settings, admins }: Ctx): GuideStep {
  const policy = calendarConfirmPolicy(settings);
  const workbench =
    "Each published topic's Scheduling tab on My Topics shows which upcoming times suit the people who ❤️'d it.";
  const next = {
    admins: ` The ${admins} schedule the sessions.`,
    hosts_propose: ` Pencil one in; the ${admins} confirm it.`,
    hosts_confirm: " Pencil one in, then confirm it with a room.",
  }[policy];
  return {
    title: "Find a time",
    body: workbench + next,
    href: `${base}/my-topics`,
    linkLabel: "My Topics",
  };
}

function adminSection(ctx: Ctx): GuideSection {
  const { base, hosts } = ctx;
  const schedule: GuideStep = ctx.calendarOn
    ? {
        title: "Build the schedule",
        body: "Set weekly times and terms on the Calendar; the slots are generated from them.",
        href: `${base}/calendar`,
        linkLabel: "Calendar",
      }
    : {
        title: "Scheduling",
        body: "The calendar is off. Switching it on in Forum Settings adds times, availability, and sessions.",
        href: `${base}/settings`,
        linkLabel: "Forum Settings",
      };
  return {
    id: "admin",
    heading: heading(ctx, "admin"),
    steps: [
      {
        title: "Publish topics",
        body: `Pending Topics lists every draft; the badge counts the ones their ${hosts} have marked ready.`,
        href: `${base}/pending`,
        linkLabel: "Pending Topics",
      },
      {
        title: "Bring people in",
        body: "Add someone on People — nothing is sent yet. Fill in their profile or write topics for them, then press Send invite when it's all ready.",
        href: `${base}/people`,
        linkLabel: "People",
      },
      schedule,
      {
        title: "Shape the forum",
        body: "Forum Settings covers who can read it, what roles are called, email defaults, and the ❤️ cutoff for starting a new round of voting.",
        href: `${base}/settings`,
        linkLabel: "Forum Settings",
      },
      {
        title: "See what happened",
        body: "The Activity Log records every publish, ❤️, comment, and invite.",
        href: `${base}/log`,
        linkLabel: "Activity Log",
      },
    ],
  };
}

function loopSection({ base }: Ctx): GuideSection {
  return {
    id: "loop",
    heading: "Staying in the loop",
    steps: [
      {
        title: "Notifications",
        body: "Replies, @mentions, and news about your topics collect here. The same page sets your email digest and, optionally, device alerts.",
        href: `${base}/notifications`,
        linkLabel: "Notifications",
      },
      {
        title: "Your profile",
        body: "Your name, photo, and bio appear wherever you post. Everyone else's are on People.",
        href: `${base}/profile`,
        linkLabel: "Profile",
      },
    ],
  };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
