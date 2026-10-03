import { beforeEach, describe, expect, it, vi } from "vitest";

// Core's push store (packages/core/src/push.ts) through the package name,
// with the database faked at `@timetable/db` (plan §2 item 7: no relative
// imports into core, `rootDir` untouched). The SQL itself — the advisory
// locks, the unique endpoint, the cap under a race — was exercised against
// Postgres 16 when this landed (docs/execution-journal/2026-10-03-push-data.md).
const fake = vi.hoisted(() => ({
  /** Queued results, one per awaited select/insert/update/delete. */
  results: [] as unknown[][],
  executed: [] as unknown[],
  inserted: [] as unknown[],
  updated: [] as unknown[],
  deleted: 0,
  fail: false,
}));

vi.mock("@timetable/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@timetable/db")>();
  function chain(onCall?: (value: unknown) => void) {
    const next = () => {
      if (fake.fail) return Promise.reject(new Error("leak https://endpoint"));
      return Promise.resolve(fake.results.shift() ?? []);
    };
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "limit", "orderBy", "returning"])
      c[m] = () => c;
    c.values = (v: unknown) => (onCall?.(v), c);
    c.set = (v: unknown) => (onCall?.(v), c);
    c.then = (ok: (rows: unknown[]) => unknown, bad: (e: unknown) => unknown) =>
      next().then(ok, bad);
    return c;
  }
  const tx = {
    execute: (q: unknown) => {
      fake.executed.push(q);
      return Promise.resolve([]);
    },
    select: () => chain(),
    insert: () => chain((v) => fake.inserted.push(v)),
    update: () => chain((v) => fake.updated.push(v)),
    delete: () => {
      fake.deleted++;
      return chain();
    },
  };
  return {
    ...actual,
    db: { ...tx, transaction: (run: (t: typeof tx) => unknown) => run(tx) },
  };
});

import {
  hasPushSubscription,
  isPlausiblePushEndpoint,
  listPushDevices,
  subscribePush,
  unsubscribePush,
} from "@timetable/core";
import { PUSH_DEVICE_CAP } from "@timetable/shared";

const endpoint = "https://fcm.googleapis.com/fcm/send/device-1";
const keys = { p256dh: `B${"a".repeat(86)}`, auth: "x".repeat(22) };
const row = {
  id: "sub-1",
  label: "Chrome on Android",
  createdAt: new Date("2026-10-01T00:00:00Z"),
  lastSentAt: null,
  endpoint,
};

beforeEach(() => {
  fake.results = [];
  fake.executed = [];
  fake.inserted = [];
  fake.updated = [];
  fake.deleted = 0;
  fake.fail = false;
});

describe("isPlausiblePushEndpoint", () => {
  it("wants an absolute https URL of sane length", () => {
    expect(isPlausiblePushEndpoint(endpoint)).toBe(true);
    expect(isPlausiblePushEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isPlausiblePushEndpoint("not a url")).toBe(false);
    expect(isPlausiblePushEndpoint(`https://a.b/${"x".repeat(2000)}`)).toBe(
      false,
    );
    expect(isPlausiblePushEndpoint(undefined)).toBe(false);
  });
});

describe("subscribePush", () => {
  it("rejects malformed input without touching the database", async () => {
    expect(
      await subscribePush("alice", { endpoint: "http://x", ...keys }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await subscribePush("alice", { endpoint, p256dh: "short", auth: "x" }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(fake.executed).toHaveLength(0);
  });

  it("creates a new device under the endpoint and user locks", async () => {
    fake.results = [[], [{ n: 0 }], [row]];
    const result = await subscribePush("alice", {
      endpoint,
      ...keys,
      label: "  Chrome on   Android ",
    });
    expect(result).toEqual({
      ok: true,
      created: true,
      device: {
        id: "sub-1",
        label: "Chrome on Android",
        createdAt: row.createdAt,
        lastSentAt: null,
        current: true,
      },
    });
    expect(fake.executed).toHaveLength(2); // endpoint lock, then user lock
    expect(fake.inserted).toEqual([
      {
        userId: "alice",
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        label: "Chrome on Android",
      },
    ]);
  });

  it("refreshes the keys of the caller's own device and resets failures", async () => {
    fake.results = [[{ id: "sub-1", userId: "alice" }], [row]];
    const result = await subscribePush("alice", {
      endpoint,
      p256dh: `${keys.p256dh}=`,
      auth: keys.auth,
    });
    expect(result).toMatchObject({ ok: true, created: false });
    expect(fake.inserted).toHaveLength(0);
    expect(fake.updated[0]).toMatchObject({
      p256dh: keys.p256dh,
      auth: keys.auth,
      failureCount: 0,
    });
    // No label sent: the stored one is kept.
    expect(fake.updated[0]).not.toHaveProperty("label");
    expect(fake.executed).toHaveLength(1); // no cap check for a refresh
  });

  it("never moves a browser's subscription to another account", async () => {
    fake.results = [[{ id: "sub-1", userId: "bob" }]];
    expect(await subscribePush("alice", { endpoint, ...keys })).toEqual({
      ok: false,
      reason: "taken",
    });
    expect(fake.inserted).toHaveLength(0);
    expect(fake.updated).toHaveLength(0);
  });

  it("enforces the per-user device cap", async () => {
    fake.results = [[], [{ n: PUSH_DEVICE_CAP }]];
    expect(await subscribePush("alice", { endpoint, ...keys })).toEqual({
      ok: false,
      reason: "cap",
    });
    expect(fake.inserted).toHaveLength(0);
  });

  it("allows the last device under the cap", async () => {
    fake.results = [[], [{ n: PUSH_DEVICE_CAP - 1 }], [row]];
    expect(await subscribePush("alice", { endpoint, ...keys })).toMatchObject({
      ok: true,
      created: true,
    });
  });

  it("sanitises database errors, which can carry the endpoint", async () => {
    fake.fail = true;
    const error = await subscribePush("alice", { endpoint, ...keys }).catch(
      (e: unknown) => e as Error,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Push subscription operation failed");
    expect((error as Error).message).not.toContain("https://");
  });
});

describe("unsubscribePush", () => {
  it("reports whether the caller's row was removed", async () => {
    fake.results = [[{ id: "sub-1" }]];
    expect(await unsubscribePush("alice", endpoint)).toBe(true);
    fake.results = [[]];
    expect(await unsubscribePush("alice", endpoint)).toBe(false);
    expect(fake.deleted).toBe(2);
  });
});

describe("listPushDevices / hasPushSubscription", () => {
  it("marks the asking device and never returns endpoints", async () => {
    fake.results = [
      [row, { ...row, id: "sub-2", endpoint: "https://other", label: null }],
    ];
    const devices = await listPushDevices("alice", endpoint);
    expect(devices.map((d) => [d.id, d.current])).toEqual([
      ["sub-1", true],
      ["sub-2", false],
    ]);
    for (const d of devices) expect(d).not.toHaveProperty("endpoint");
  });

  it("marks nothing current without an endpoint", async () => {
    fake.results = [[row]];
    expect((await listPushDevices("alice"))[0]?.current).toBe(false);
  });

  it("answers for this user's device", async () => {
    fake.results = [[{ id: "sub-1" }]];
    expect(await hasPushSubscription("alice", endpoint)).toBe(true);
    fake.results = [[]];
    expect(await hasPushSubscription("alice", endpoint)).toBe(false);
  });
});
