import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rows: [] as unknown[][],
  readable: vi.fn(),
  notifications: vi.fn(),
  insert: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@timetable/db", () => {
  function query() {
    const chain = {
      from: () => chain,
      where: () => chain,
      innerJoin: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      for: () => chain,
      then: (resolve: (rows: unknown[]) => void) =>
        resolve(mocks.rows.shift() ?? []),
    };
    return chain;
  }
  const tx = {
    select: query,
    execute: vi.fn(),
    insert: (...args: unknown[]) => {
      mocks.insert(...args);
      return { values: () => ({ onConflictDoNothing: vi.fn() }) };
    },
    delete: (...args: unknown[]) => {
      mocks.remove(...args);
      return { where: vi.fn() };
    },
    update: () => ({
      set: (values: unknown) => {
        mocks.update(values);
        return { where: vi.fn() };
      },
    }),
  };
  return {
    db: { ...tx, transaction: (run: (db: typeof tx) => unknown) => run(tx) },
    pushSubscriptions: {
      id: "id",
      endpoint: "endpoint",
      membershipId: "membership_id",
      lastAttemptAt: "last_attempt_at",
    },
    timetableMemberships: {
      id: "member_id",
      userId: "user_id",
      timetableId: "forum_id",
    },
    topics: { id: "topic_id", timetableId: "forum_id", status: "status" },
  };
});
vi.mock("../../../packages/core/src/timetables", () => ({
  getReadableTimetable: mocks.readable,
}));
vi.mock("../../../packages/core/src/notifications", () => ({
  listNotifications: mocks.notifications,
}));
import { deliverPush, managePush } from "../../../packages/core/src/push";

const member = {
  id: "membership",
  userId: "alice",
  timetableId: "forum",
  deactivatedAt: null,
  lastSeenNotificationsAt: null,
};
const subscription = {
  id: "subscription",
  membershipId: member.id,
  endpoint: "https://fcm.googleapis.com/send/id",
  lastCheckedAt: new Date("2026-01-01"),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows.length = 0;
  mocks.readable.mockResolvedValue({
    roles: ["elector"],
    timetable: { id: "forum", settings: {} },
  });
  mocks.notifications.mockResolvedValue([
    {
      topicId: "topic",
      visibility: "public",
      kind: "reply",
      createdAt: new Date("2026-01-02"),
    },
  ]);
});
describe("push authorization and delivery", () => {
  it("refuses a readable public forum without membership", async () => {
    mocks.readable.mockResolvedValue({ roles: [], timetable: { id: "forum" } });
    expect(
      (await managePush("alice", "forum", subscription.endpoint, "enable"))
        .status,
    ).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("refuses a deactivated membership", async () => {
    mocks.rows.push([{ ...member, deactivatedAt: new Date() }]);
    expect(
      (await managePush("alice", "forum", subscription.endpoint, "enable"))
        .status,
    ).toBe(403);
  });
  it("never transfers another account's browser endpoint", async () => {
    mocks.rows.push([member], [{ userId: "bob" }]);
    expect(
      (await managePush("alice", "forum", subscription.endpoint, "enable"))
        .status,
    ).toBe(409);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("removes deactivated memberships' subscriptions without sending", async () => {
    mocks.rows.push(
      [{ id: subscription.id }],
      [subscription],
      [{ ...member, deactivatedAt: new Date() }],
    );
    const send = vi.fn();
    expect(await deliverPush(send)).toMatchObject({ gone: 1 });
    expect(send).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalled();
  });
  it("suppresses delivery when the forum is no longer readable", async () => {
    mocks.rows.push([{ id: subscription.id }], [subscription], [member]);
    mocks.readable.mockResolvedValue(null);
    const send = vi.fn();
    expect(await deliverPush(send)).toMatchObject({ skipped: 1 });
    expect(send).not.toHaveBeenCalled();
  });
  it("suppresses activity on unpublished topics", async () => {
    mocks.rows.push([{ id: subscription.id }], [subscription], [member], []);
    const send = vi.fn();
    expect(await deliverPush(send)).toMatchObject({ skipped: 1 });
    expect(send).not.toHaveBeenCalled();
  });
  it("keeps the watermark on transient failure so the job can retry", async () => {
    mocks.rows.push(
      [{ id: subscription.id }],
      [subscription],
      [member],
      [{ id: "topic" }],
    );
    const send = vi.fn().mockResolvedValue("retry");
    expect(await deliverPush(send)).toMatchObject({ retry: 1 });
    expect(mocks.update).toHaveBeenCalledWith({
      lastAttemptAt: expect.any(Date),
    });
  });
  it("deletes an expired provider subscription", async () => {
    mocks.rows.push(
      [{ id: subscription.id }],
      [subscription],
      [member],
      [{ id: "topic" }],
    );
    const send = vi.fn().mockResolvedValue("gone");
    expect(await deliverPush(send)).toMatchObject({ gone: 1 });
    expect(mocks.remove).toHaveBeenCalled();
  });
});
