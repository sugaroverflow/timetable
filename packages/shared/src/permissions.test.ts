import { describe, expect, it } from "vitest";

import {
  ANONYMOUS,
  calendarConfirmPolicy,
  canComment,
  canConfirmSession,
  canEditSettings,
  canEditTopic,
  canHeart,
  canModerate,
  canProposeSession,
  canPublishTopicDirectly,
  canReadTimetable,
  canSeeComments,
  canSeePersonProfile,
  canTouchSlotSession,
  canUseQueue,
  isCalendarEnabled,
  ownsTopicAsHost,
  type Viewer,
} from "./permissions";

const MEMBER: Viewer = { userId: "u1", roles: ["elector"] };
const SIGNED_IN_GUEST: Viewer = { userId: "u2", roles: [] };

describe("canSeePersonProfile", () => {
  it("members see every profile regardless of privacy", () => {
    expect(canSeePersonProfile("hosts_only", MEMBER, ["elector"])).toBe(true);
    expect(canSeePersonProfile("private", MEMBER, ["elector"])).toBe(true);
  });

  it("the public sees everyone on public and no_comments forums", () => {
    for (const privacy of ["public", "no_comments"] as const) {
      expect(canSeePersonProfile(privacy, ANONYMOUS, ["elector"])).toBe(true);
      expect(canSeePersonProfile(privacy, SIGNED_IN_GUEST, ["host"])).toBe(
        true,
      );
    }
  });

  it("hosts_only shows the public hosts and admins but never electors", () => {
    expect(canSeePersonProfile("hosts_only", ANONYMOUS, ["host"])).toBe(true);
    expect(canSeePersonProfile("hosts_only", ANONYMOUS, ["admin"])).toBe(true);
    expect(
      canSeePersonProfile("hosts_only", ANONYMOUS, ["owner", "admin"]),
    ).toBe(true);
    expect(canSeePersonProfile("hosts_only", ANONYMOUS, ["elector"])).toBe(
      false,
    );
    expect(
      canSeePersonProfile("hosts_only", SIGNED_IN_GUEST, ["elector"]),
    ).toBe(false);
  });
});

describe("sysadmin oversight (read-only)", () => {
  const SYSADMIN: Viewer = { userId: "op", roles: [], sysadmin: true };

  it("reads everything, private and deactivated forums included", () => {
    expect(canReadTimetable("private", SYSADMIN)).toBe(true);
    expect(canReadTimetable("deactivated", SYSADMIN)).toBe(true);
    expect(canSeeComments("private", SYSADMIN)).toBe(true);
    expect(canSeePersonProfile("private", SYSADMIN, ["elector"])).toBe(true);
  });

  it("never unlocks writes — the flag is ignored by action checks", () => {
    expect(canHeart(SYSADMIN)).toBe(false);
    expect(canComment(SYSADMIN)).toBe(false);
    expect(canModerate(SYSADMIN)).toBe(false);
    expect(canEditSettings(SYSADMIN)).toBe(false);
    expect(canUseQueue(SYSADMIN)).toBe(false);
  });

  it("changes nothing for ordinary non-members", () => {
    expect(canReadTimetable("private", SIGNED_IN_GUEST)).toBe(false);
  });
});

describe("canUseQueue", () => {
  it("every member role gets a queue; guests and non-members none", () => {
    expect(canUseQueue({ userId: "u", roles: ["elector"] })).toBe(true);
    expect(canUseQueue({ userId: "u", roles: ["host"] })).toBe(true);
    expect(canUseQueue({ userId: "u", roles: ["admin"] })).toBe(true);
    expect(canUseQueue(SIGNED_IN_GUEST)).toBe(false);
    expect(canUseQueue(ANONYMOUS)).toBe(false);
  });
});

describe("canEditTopic", () => {
  const HOST: Viewer = { userId: "h1", roles: ["host"] };
  const ADMIN: Viewer = { userId: "a1", roles: ["admin"] };

  it("the owning host can edit their own topic only", () => {
    expect(canEditTopic(HOST, "h1")).toBe(true);
    expect(canEditTopic(HOST, "h2")).toBe(false);
  });

  it("owning the topic without the host role is not enough", () => {
    expect(canEditTopic({ userId: "u1", roles: ["elector"] }, "u1")).toBe(
      false,
    );
  });

  it("admins can edit any topic", () => {
    expect(canEditTopic(ADMIN, "h1")).toBe(true);
  });

  it("anonymous viewers can never edit", () => {
    expect(canEditTopic(ANONYMOUS, "h1")).toBe(false);
  });

  it("ownsTopicAsHost is false for admin overrides (they get logged)", () => {
    expect(ownsTopicAsHost(ADMIN, "h1")).toBe(false);
    expect(ownsTopicAsHost(HOST, "h1")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Calendar v2: settings-dependent permissions
// ---------------------------------------------------------------------------

describe("calendar session permissions", () => {
  const ADMIN: Viewer = { userId: "a1", roles: ["admin"] };
  const HOST: Viewer = { userId: "h1", roles: ["host"] };
  const ELECTOR: Viewer = { userId: "e1", roles: ["elector"] };

  it("isCalendarEnabled defaults off and follows the flag", () => {
    expect(isCalendarEnabled({})).toBe(false);
    expect(isCalendarEnabled({ calendar: {} })).toBe(false);
    expect(isCalendarEnabled({ calendar: { enabled: true } })).toBe(true);
    expect(isCalendarEnabled({ calendar: { enabled: false } })).toBe(false);
  });

  it("confirm policy defaults to hosts_propose", () => {
    expect(calendarConfirmPolicy({})).toBe("hosts_propose");
    expect(
      calendarConfirmPolicy({ calendar: { confirmPolicy: "admins" } }),
    ).toBe("admins");
  });

  it("proposing follows the policy ladder; admins always may", () => {
    expect(canProposeSession(ADMIN, "admins")).toBe(true);
    expect(canProposeSession(HOST, "admins")).toBe(false);
    expect(canProposeSession(HOST, "hosts_propose")).toBe(true);
    expect(canProposeSession(HOST, "hosts_confirm")).toBe(true);
    expect(canProposeSession(ELECTOR, "hosts_confirm")).toBe(false);
  });

  it("confirming needs hosts_confirm for hosts; admins always may", () => {
    expect(canConfirmSession(ADMIN, "admins")).toBe(true);
    expect(canConfirmSession(HOST, "hosts_propose")).toBe(false);
    expect(canConfirmSession(HOST, "hosts_confirm")).toBe(true);
    expect(canConfirmSession(ELECTOR, "hosts_confirm")).toBe(false);
  });

  it("never-displace: hosts touch only open slots or their own session", () => {
    expect(canTouchSlotSession(HOST, null)).toBe(true);
    expect(canTouchSlotSession(HOST, "h1")).toBe(true);
    expect(canTouchSlotSession(HOST, "other-host")).toBe(false);
    expect(canTouchSlotSession(ADMIN, "other-host")).toBe(true);
  });

  it("direct topic publishing needs the forum opt-in AND ownership", () => {
    const on = { topics: { hostsPublishDirectly: true } };
    expect(canPublishTopicDirectly(HOST, on, "h1")).toBe(true);
    expect(canPublishTopicDirectly(HOST, on, "other")).toBe(false);
    expect(canPublishTopicDirectly(HOST, {}, "h1")).toBe(false);
    // Admins go through canModerate instead — this helper is host-only.
    expect(canPublishTopicDirectly(ADMIN, on, "someone")).toBe(false);
  });
});
