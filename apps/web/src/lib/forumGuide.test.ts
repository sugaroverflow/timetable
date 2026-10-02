import { describe, expect, it } from "vitest";

import type { Role, TimetableSettings } from "@timetable/shared";

import { buildForumGuide, type ForumGuideInput } from "./forumGuide";

function guide(overrides: Partial<ForumGuideInput> = {}) {
  return buildForumGuide({
    base: "/f/demo",
    roles: [],
    settings: {},
    isAuthed: true,
    calendarVisible: false,
    ...overrides,
  });
}

const ids = (g: ReturnType<typeof guide>) => g.sections.map((s) => s.id);
const hrefs = (g: ReturnType<typeof guide>) =>
  g.sections.flatMap((s) => s.steps.map((step) => step.href));
const text = (g: ReturnType<typeof guide>) =>
  JSON.stringify(g.sections) + g.summary;

describe("buildForumGuide", () => {
  it("shows only the sections for the roles the viewer holds", () => {
    expect(ids(guide({ roles: ["elector"] }))).toEqual(["elector", "loop"]);
    expect(ids(guide({ roles: ["host"] }))).toEqual(["host", "loop"]);
    expect(ids(guide({ roles: ["host", "admin"] }))).toEqual([
      "host",
      "admin",
      "loop",
    ]);
    // Owners count as admins.
    expect(ids(guide({ roles: ["owner"] }))).toEqual(["admin", "loop"]);
  });

  it("gives non-members a visitor section and nothing member-only", () => {
    const g = guide({ roles: [], isAuthed: false });
    expect(ids(g)).toEqual(["visitor"]);
    expect(hrefs(g)).toContain("/sign-in");
    // A signed-in non-member is told to ask, not to sign in again.
    expect(hrefs(guide({ roles: [] }))).not.toContain("/sign-in");
  });

  it("speaks in the forum's own role labels", () => {
    const settings: TimetableSettings = {
      roleLabels: { admin: "Dean", host: "Faculty", elector: "Fellow" },
    };
    const g = guide({
      roles: ["host", "elector", "admin"] as Role[],
      settings,
    });
    expect(g.summary).toMatch(/^Faculty propose/);
    expect(g.summary).toContain("Fellows read them");
    expect(g.sections.map((s) => s.heading)).toEqual([
      "For Fellows",
      "For Faculty",
      "For Deans",
      "Staying in the loop",
    ]);
    expect(guide({ roles: ["admin"] }).sections[0]?.heading).toBe("For Admins");
  });

  it("points at the calendar only when the viewer's sidebar has it", () => {
    const calendar = { calendar: { enabled: true } };
    expect(hrefs(guide({ roles: ["elector"] }))).not.toContain(
      "/f/demo/calendar",
    );
    expect(
      hrefs(
        guide({
          roles: ["elector"],
          settings: calendar,
          calendarVisible: true,
        }),
      ),
    ).toContain("/f/demo/calendar");
    // Admins with the calendar off are pointed at the switch instead.
    const off = guide({ roles: ["admin"] });
    expect(text(off)).toContain("The calendar is off");
  });

  it("follows the forum's publish and scheduling policies", () => {
    expect(text(guide({ roles: ["host"] }))).toContain("Ready to publish");
    expect(
      text(
        guide({
          roles: ["host"],
          settings: { topics: { hostsPublishDirectly: true } },
        }),
      ),
    ).toContain("publish it yourself");

    const policy = (
      confirmPolicy: "admins" | "hosts_propose" | "hosts_confirm",
    ) =>
      text(
        guide({
          roles: ["host"],
          settings: { calendar: { enabled: true, confirmPolicy } },
        }),
      );
    expect(policy("admins")).not.toContain("Pencil one in");
    expect(policy("hosts_propose")).toContain("the admins confirm it");
    expect(policy("hosts_confirm")).toContain("confirm it with a room");
  });

  it("offers 💙 only to hosts who can't ❤️", () => {
    expect(hrefs(guide({ roles: ["host"] }))).toContain(
      "/f/demo/topics?hearted=host",
    );
    const both = hrefs(guide({ roles: ["host", "elector"] }));
    expect(both).not.toContain("/f/demo/topics?hearted=host");
    expect(both).toContain("/f/demo/topics?hearted=me");
  });

  it("mentions the host-only tab only while the forum has it", () => {
    expect(text(guide({ roles: ["host"] }))).toContain("a tab only hosts");
    expect(
      text(
        guide({
          roles: ["host"],
          settings: { hostComments: { enabled: false } },
        }),
      ),
    ).not.toContain("a tab only hosts");
  });

  it("never says the word heart or feed in its copy", () => {
    const g = guide({
      roles: ["owner", "host", "elector"],
      settings: { calendar: { enabled: true } },
      calendarVisible: true,
    });
    const copy =
      g.summary +
      JSON.stringify(
        g.sections.map((s) => [
          s.heading,
          s.steps.map((t) => [t.title, t.body]),
        ]),
      );
    expect(copy).not.toMatch(/\bhearts?\b|\bfeed\b/i);
  });
});
