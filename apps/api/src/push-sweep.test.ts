import {
  buildPushPayload,
  decidePushAlerts,
  decidePushCandidate,
  type PushAlert,
  type PushCandidate,
  type PushClaim,
  type PushDeliveryResults,
  type PushForum,
  type PushMembership,
  type PushRecipientContext,
  type PushTarget,
  type PushTopicRef,
} from "@timetable/core";
import type { Role } from "@timetable/shared";
import { describe, expect, it, vi } from "vitest";

import type { PushSendResult } from "./push-transport";
import {
  createPushSweeper,
  planDeviceSends,
  startPushSweepTimer,
  sweepPush,
  type PushSweepDeps,
} from "./push-sweep";

// The sweep's pure half (core `pushAudience.ts`) and its orchestration
// (`push-sweep.ts`) with the database and the transport faked: no network,
// no Postgres. The SQL itself — the claim's lock and compare-and-set, the
// readers, the result statements — is covered by `push-sweep.db.test.ts`,
// which runs only against a migrated database (PUSH_SWEEP_DB_TEST=1).

const T0 = new Date("2026-10-03T12:00:00Z");
const at = (s: number) => new Date(T0.getTime() + s * 1000);

const forum: PushForum = {
  id: "forum-1",
  slug: "newspeak-2026",
  name: "Newspeak 2026",
  privacy: "private",
  settings: {
    roleLabels: { host: "Faculty" },
    lounge: { enabled: true },
    calendar: { enabled: true },
  },
};

const topic: PushTopicRef = {
  id: "topic-1",
  title: "Housing policy",
  slug: "housing-policy",
  hostId: "host",
  hostSlug: "ada",
  published: true,
};

function member(
  roles: Role[],
  extra: Partial<PushMembership> = {},
): PushMembership {
  return {
    roles,
    deactivatedAt: null,
    push: undefined,
    loungeSeenAt: null,
    ...extra,
  };
}

function context(
  members: Record<string, PushMembership>,
  opts: {
    forum?: PushForum;
    seen?: Record<string, Date>;
    forums?: Record<string, number>;
  } = {},
): PushRecipientContext {
  const f = opts.forum ?? forum;
  return {
    membership: (u, t) => (t === f.id ? members[u] : undefined),
    forum: (t) => (t === f.id ? f : undefined),
    commentSeenAt: (u, t) => opts.seen?.[`${u}:${t}`],
    forumCount: (u) => opts.forums?.[u] ?? 1,
  };
}

function commentCandidate(
  userId: string,
  overrides: Partial<PushCandidate> & {
    visibility?: "public" | "host_only" | "admin_only";
    body?: string;
  } = {},
): PushCandidate {
  const {
    visibility = "public",
    body = "but we have infinitely nesting threads",
    ...rest
  } = overrides;
  return {
    eventKey: "comment:c1",
    userId,
    timetableId: forum.id,
    at: at(0),
    actorId: "joshua",
    kinds: ["comments"],
    message: {
      type: "comment",
      commentId: "c1",
      visibility,
      topic,
      who: "Joshua Becker",
      body,
    },
    ...rest,
  };
}

function loungeCandidate(userId: string): PushCandidate {
  return {
    eventKey: "lounge:l2",
    userId,
    timetableId: forum.id,
    at: at(0),
    actorId: "joshua",
    kinds: ["lounge"],
    message: {
      type: "lounge",
      commentId: "l2",
      rootId: "l1",
      isRoot: false,
      who: "Joshua Becker",
      body: "but we have infinitely nesting…\nsecond line",
    },
  };
}

describe("decidePushCandidate — who never gets an alert", () => {
  const ctx = context({
    host: member(["host"]),
    admin: member(["admin"]),
    elector: member(["elector"]),
    joshua: member(["host"]),
    gone: member(["host"], { deactivatedAt: at(-3600) }),
  });

  it("alerts the topic's host about a public comment", () => {
    expect(decidePushCandidate(commentCandidate("host"), ctx)).toEqual({
      send: true,
      kind: "comments",
    });
  });

  it("never alerts you about your own comment", () => {
    expect(
      decidePushCandidate(
        commentCandidate("joshua", { kinds: ["replies"] }),
        ctx,
      ),
    ).toEqual({ send: false, reason: "own-action" });
  });

  it("gives a deactivated member nothing", () => {
    expect(decidePushCandidate(commentCandidate("gone"), ctx)).toEqual({
      send: false,
      reason: "deactivated",
    });
    expect(decidePushCandidate(loungeCandidate("gone"), ctx)).toEqual({
      send: false,
      reason: "deactivated",
    });
  });

  it("gives someone no longer in the forum nothing", () => {
    expect(decidePushCandidate(commentCandidate("stranger"), ctx)).toEqual({
      send: false,
      reason: "not-a-member",
    });
  });

  it("gives an elector nothing from a drafting thread, even with the switch on", () => {
    const c = commentCandidate("elector", {
      visibility: "admin_only",
      kinds: ["replies", "mentions"],
    });
    expect(decidePushCandidate(c, ctx)).toEqual({
      send: false,
      reason: "thread-hidden",
    });
  });

  it("lets the topic's host and admins read the drafting thread", () => {
    const draft = (u: string) =>
      commentCandidate(u, {
        visibility: "admin_only",
        kinds: ["comments", "replies"],
      });
    expect(decidePushCandidate(draft("host"), ctx).send).toBe(true);
    expect(decidePushCandidate(draft("admin"), ctx).send).toBe(true);
    // Another host is not the topic's host.
    const other = context({ other: member(["host"]) });
    expect(decidePushCandidate(draft("other"), other)).toEqual({
      send: false,
      reason: "thread-hidden",
    });
  });

  it("keeps {host}-only threads from electors", () => {
    const c = commentCandidate("elector", {
      visibility: "host_only",
      kinds: ["replies"],
    });
    expect(decidePushCandidate(c, ctx).send).toBe(false);
  });

  it("keeps an unpublished topic's public thread to its host and admins", () => {
    const c = commentCandidate("elector", { kinds: ["replies"] });
    if (c.message.type !== "comment") throw new Error("shape");
    c.message.topic = { ...topic, published: false };
    expect(decidePushCandidate(c, ctx)).toEqual({
      send: false,
      reason: "thread-hidden",
    });
  });

  it("gates the Lounge on canUseLounge and isLoungeEnabled", () => {
    expect(decidePushCandidate(loungeCandidate("host"), ctx).send).toBe(true);
    expect(decidePushCandidate(loungeCandidate("elector"), ctx)).toEqual({
      send: false,
      reason: "lounge-closed",
    });
    const closed = context(
      { host: member(["host"]) },
      { forum: { ...forum, settings: { lounge: { enabled: false } } } },
    );
    expect(decidePushCandidate(loungeCandidate("host"), closed)).toEqual({
      send: false,
      reason: "lounge-closed",
    });
  });

  it("respects private and deactivated forums", () => {
    const shut = context(
      { host: member(["host"]) },
      { forum: { ...forum, privacy: "deactivated" } },
    );
    expect(decidePushCandidate(commentCandidate("host"), shut)).toEqual({
      send: false,
      reason: "forum-unreadable",
    });
  });

  it("reads the Push switch, falling back to the defaults", () => {
    const off = context({
      host: member(["host"], { push: { comments: false } }),
    });
    expect(decidePushCandidate(commentCandidate("host"), off)).toEqual({
      send: false,
      reason: "kind-off",
    });
    // Broadcast kinds are off by default…
    const hearted = commentCandidate("elector", { kinds: ["commentsHearted"] });
    expect(decidePushCandidate(hearted, ctx)).toEqual({
      send: false,
      reason: "kind-off",
    });
    // …and on when switched on.
    const on = context({
      elector: member(["elector"], { push: { commentsHearted: true } }),
    });
    expect(decidePushCandidate(hearted, on)).toEqual({
      send: true,
      kind: "commentsHearted",
    });
  });

  it("alerts when any qualifying switch is on and applies", () => {
    const ctx2 = context({
      host: member(["host"], { push: { comments: false } }),
    });
    expect(
      decidePushCandidate(
        commentCandidate("host", { kinds: ["comments", "replies"] }),
        ctx2,
      ),
    ).toEqual({ send: true, kind: "replies" });
  });

  it("applies the audience rule (sessions are elector business)", () => {
    const c: PushCandidate = {
      eventKey: "activity:a1",
      userId: "host",
      timetableId: forum.id,
      at: at(0),
      actorId: "admin",
      kinds: ["sessions"],
      message: {
        type: "session",
        action: "confirm",
        topic,
        startsAt: new Date("2026-10-14T17:00:00Z"),
        location: "Room 2",
      },
    };
    expect(decidePushCandidate(c, ctx)).toEqual({
      send: false,
      reason: "kind-off",
    });
    expect(decidePushCandidate({ ...c, userId: "elector" }, ctx).send).toBe(
      true,
    );
    const noCalendar = context(
      { elector: member(["elector"]) },
      { forum: { ...forum, settings: {} } },
    );
    expect(
      decidePushCandidate({ ...c, userId: "elector" }, noCalendar),
    ).toEqual({
      send: false,
      reason: "calendar-off",
    });
  });

  it("skips a thread already read past", () => {
    const read = context(
      { host: member(["host"]) },
      { seen: { "host:topic-1": at(5) } },
    );
    expect(decidePushCandidate(commentCandidate("host"), read)).toEqual({
      send: false,
      reason: "read-past",
    });
    const lounge = context({ host: member(["host"], { loungeSeenAt: at(1) }) });
    expect(decidePushCandidate(loungeCandidate("host"), lounge)).toEqual({
      send: false,
      reason: "read-past",
    });
  });

  it("sends the switch-less sent-back notice whatever the switches say", () => {
    const allOff = context({
      host: member(["host"], {
        push: Object.fromEntries(
          ["comments", "replies", "mentions", "lounge"].map((k) => [k, false]),
        ),
      }),
    });
    const c: PushCandidate = {
      eventKey: "activity:u1",
      userId: "host",
      timetableId: forum.id,
      at: at(0),
      actorId: "admin",
      kinds: null,
      message: {
        type: "sentBack",
        who: "Ed",
        topic: { ...topic, published: false },
      },
    };
    expect(decidePushCandidate(c, allOff)).toEqual({ send: true, kind: null });
  });
});

describe("alert text", () => {
  const opts = { multiForum: false, viewerIsAdmin: false };

  it("says who, where and the first line, linking to the comment", () => {
    expect(buildPushPayload(commentCandidate("host"), forum, opts)).toEqual({
      title: "Joshua Becker in Housing policy",
      body: "but we have infinitely nesting threads",
      url: "/f/newspeak-2026/ada/housing-policy?tab=comments&topic=topic-1#comment-c1",
      tag: "topic:topic-1:comments",
    });
    const draft = commentCandidate("host", { visibility: "admin_only" });
    expect(buildPushPayload(draft, forum, opts).url).toContain("?tab=admin&");
    expect(buildPushPayload(draft, forum, opts).tag).toBe(
      "topic:topic-1:admin",
    );
  });

  it("names the forum for people in more than one", () => {
    expect(
      buildPushPayload(commentCandidate("host"), forum, {
        ...opts,
        multiForum: true,
      }).title,
    ).toBe("Joshua Becker in Housing policy · Newspeak 2026");
  });

  it("names the Lounge by the forum's {host} label, with ?reply=", () => {
    expect(buildPushPayload(loungeCandidate("host"), forum, opts)).toEqual({
      title: "Joshua Becker in Faculty Lounge",
      body: "but we have infinitely nesting…",
      url: "/f/newspeak-2026/lounge?c=l1&reply=l2#comment-l2",
      tag: "lounge:l1",
    });
  });

  it("words the fixed-text kinds", () => {
    const base = {
      eventKey: "e",
      userId: "u",
      timetableId: forum.id,
      at: at(0),
      actorId: "x",
      kinds: null,
    };
    const make = (message: PushCandidate["message"]) =>
      buildPushPayload({ ...base, message }, forum, opts);
    expect(
      make({
        type: "session",
        action: "confirm",
        topic,
        startsAt: new Date("2026-10-14T17:00:00Z"),
        location: "Room 2",
      }),
    ).toMatchObject({
      title: "Session confirmed: Housing policy",
      body: "Wed 14 Oct, 18:00 · Room 2",
      url: "/f/newspeak-2026/calendar",
    });
    expect(
      make({
        type: "session",
        action: "pencil",
        topic,
        startsAt: new Date("2026-10-14T17:00:00Z"),
        location: null,
      }),
    ).toMatchObject({
      title: "Can you make it? Housing policy",
      body: "Wed 14 Oct, 18:00",
    });
    expect(make({ type: "heart", gesture: "heart", topic })).toMatchObject({
      title: "A new ❤️ on Housing policy",
    });
    expect(
      make({ type: "newTopic", who: "Ada Lovelace", topic }),
    ).toMatchObject({
      title: "Ada Lovelace published a topic",
      body: "Housing policy",
    });
    expect(make({ type: "ready", who: "Ada Lovelace", topic })).toMatchObject({
      title: "Ada Lovelace marked a topic ready",
      url: "/f/newspeak-2026/pending",
    });
    expect(make({ type: "sentBack", who: "Ed", topic })).toMatchObject({
      title: "Ed moved your topic back to drafting",
      url: "/f/newspeak-2026/my-topics?tab=admin&topic=topic-1#topic-topic-1",
    });
    expect(
      make({
        type: "slotRelease",
        count: 4,
        firstStartsAt: new Date("2026-10-14T17:00:00Z"),
      }),
    ).toMatchObject({
      title: "New dates on the calendar",
      body: "4 new dates from Wed 14 Oct, 18:00",
    });
    expect(make({ type: "newMember", who: "Grace Hopper" })).toMatchObject({
      title: "Grace Hopper joined Newspeak 2026",
    });
  });

  it("gives one alert per person per event", () => {
    const ctx = context({ host: member(["host"]) });
    const alerts = decidePushAlerts(
      [
        commentCandidate("host", { kinds: ["comments"] }),
        commentCandidate("host", { kinds: ["replies"] }),
      ],
      ctx,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: "comments", urgency: "high" });
  });
});

// ---------------------------------------------------------------------------
// Fan-out and orchestration

function alert(
  userId: string,
  tag: string,
  seconds: number,
  extra: Partial<PushAlert> = {},
): PushAlert {
  return {
    userId,
    timetableId: forum.id,
    kind: "comments",
    at: at(seconds),
    urgency: "high",
    payload: {
      title: `t ${tag} ${seconds}`,
      body: "b",
      url: `/f/${forum.slug}/x`,
      tag,
    },
    forum: { slug: forum.slug, name: forum.name },
    ...extra,
  };
}

function device(
  id: string,
  userId: string,
  createdSeconds = -3600,
): PushTarget {
  return {
    id,
    userId,
    endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
    p256dh: `B${"a".repeat(86)}`,
    auth: "x".repeat(22),
    createdAt: at(createdSeconds),
  };
}

describe("planDeviceSends", () => {
  it("gives a device created after the event nothing", () => {
    const sends = planDeviceSends(
      [alert("u", "a", 0)],
      [device("old", "u", -60), device("new", "u", 30)],
    );
    expect(sends.map((s) => s.target.id)).toEqual(["old"]);
  });

  it("keeps the newest alert per thread tag", () => {
    const sends = planDeviceSends(
      [alert("u", "a", 0), alert("u", "a", 20), alert("u", "a", 10)],
      [device("d", "u")],
    );
    expect(sends).toHaveLength(1);
    expect(sends[0]!.payload.title).toBe("t a 20");
  });

  it("caps each device at three plus one 'and n more'", () => {
    const alerts = ["a", "b", "c", "d", "e", "f"].map((tag, i) =>
      alert("u", tag, i),
    );
    const sends = planDeviceSends(alerts, [
      device("d1", "u"),
      device("d2", "u"),
    ]);
    expect(sends).toHaveLength(8);
    const d1 = sends.filter((s) => s.target.id === "d1").map((s) => s.payload);
    expect(d1.map((p) => p.tag)).toEqual(["f", "e", "d", "more:newspeak-2026"]);
    expect(d1[3]).toEqual({
      title: "And 3 more in Newspeak 2026",
      body: "",
      url: "/f/newspeak-2026/notifications",
      tag: "more:newspeak-2026",
    });
  });

  it("puts aimed-at-you alerts first and points a mixed overflow at /notifications", () => {
    const other = { slug: "other", name: "Other forum" };
    const alerts = [
      alert("u", "n1", 50, { urgency: "normal" }),
      alert("u", "h1", 1),
      alert("u", "h2", 2),
      alert("u", "h3", 3),
      alert("u", "n2", 40, { urgency: "normal", forum: other }),
    ];
    const sends = planDeviceSends(alerts, [device("d", "u")]);
    expect(sends.map((s) => s.payload.tag)).toEqual(["h3", "h2", "h1", "more"]);
    expect(sends[3]!.payload).toMatchObject({
      title: "And 2 more",
      url: "/notifications",
    });
    expect(sends[3]!.urgency).toBe("normal");
  });
});

const window = { from: at(-60), to: at(0) };

function fakeDeps(overrides: Partial<PushSweepDeps> = {}) {
  const recorded: PushDeliveryResults[] = [];
  const deps: PushSweepDeps = {
    claim: vi.fn(
      async (): Promise<PushClaim> => ({ status: "claimed", window }),
    ),
    loadAlerts: vi.fn(async () => [alert("u", "a", -10)]),
    loadTargets: vi.fn(async () => [device("d1", "u")]),
    send: vi.fn(
      async (): Promise<PushSendResult> => ({ outcome: "ok", status: 201 }),
    ),
    record: vi.fn(async (r: PushDeliveryResults) => {
      recorded.push(r);
    }),
    paused: false,
    ...overrides,
  };
  return { deps, recorded };
}

describe("sweepPush", () => {
  it("sends the window's alerts and records success", async () => {
    const { deps, recorded } = fakeDeps();
    const report = await sweepPush(deps);
    expect(report).toMatchObject({ status: "swept", sends: 1, ok: 1 });
    expect(deps.send).toHaveBeenCalledTimes(1);
    const [, json, urgency] = vi.mocked(deps.send).mock.calls[0]!;
    expect(JSON.parse(json)).toMatchObject({
      tag: "a",
      url: "/f/newspeak-2026/x",
    });
    expect(urgency).toBe("high");
    expect(recorded).toEqual([{ ok: ["d1"], gone: [], failed: [] }]);
  });

  it.each(["busy", "raced", "empty"] as const)(
    "does nothing when the claim is %s (someone else owns the window)",
    async (status) => {
      const { deps } = fakeDeps({ claim: vi.fn(async () => ({ status })) });
      expect(await sweepPush(deps)).toEqual({ status });
      expect(deps.loadAlerts).not.toHaveBeenCalled();
      expect(deps.send).not.toHaveBeenCalled();
      expect(deps.record).not.toHaveBeenCalled();
    },
  );

  it("while paused claims the window (no backlog) and sends nothing", async () => {
    const { deps } = fakeDeps({ paused: true });
    expect(await sweepPush(deps)).toEqual({ status: "paused", window });
    expect(deps.claim).toHaveBeenCalledTimes(1);
    expect(deps.loadAlerts).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
    // Unpaused, the next run reads only ITS window: the claim moved on, so
    // the paused minute is never read again.
    const next = { from: window.to, to: at(60) };
    const { deps: after } = fakeDeps({
      claim: vi.fn(async () => ({ status: "claimed" as const, window: next })),
    });
    await sweepPush(after);
    expect(after.loadAlerts).toHaveBeenCalledWith(next);
  });

  it("records gone, failures and rejections per device", async () => {
    const outcomes: Record<string, PushSendResult> = {
      d1: { outcome: "gone", status: 410 },
      d2: {
        outcome: "retryable",
        status: 503,
        reason: "server-error",
        retryAfterSeconds: null,
      },
      d3: { outcome: "rate-limited", status: 429, retryAfterSeconds: 5 },
      d4: { outcome: "rejected", status: 403, reason: "refused" },
      d5: { outcome: "ok", status: 201 },
    };
    const { deps, recorded } = fakeDeps({
      loadTargets: vi.fn(async () =>
        Object.keys(outcomes).map((id) => device(id, "u")),
      ),
      send: vi.fn(async (t: PushTarget) => outcomes[t.id]!),
    });
    await sweepPush(deps);
    expect(recorded[0]).toEqual({
      ok: ["d5"],
      gone: ["d1"],
      failed: expect.arrayContaining(["d2", "d3", "d4"]),
    });
    expect(recorded[0]!.failed).toHaveLength(3);
  });

  it("stops knocking on a device once it is gone", async () => {
    const { deps, recorded } = fakeDeps({
      loadAlerts: vi.fn(async () => [
        alert("u", "a", -10),
        alert("u", "b", -5),
      ]),
      send: vi.fn(async () => ({
        outcome: "gone" as const,
        status: 410 as const,
      })),
    });
    // Run the limiter one at a time for determinism isn't needed: whichever
    // send lands first marks it gone; the device is recorded once.
    await sweepPush(deps);
    expect(recorded[0]).toEqual({ ok: [], gone: ["d1"], failed: [] });
  });

  it("sends through a limiter of 4 with no more in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const { deps } = fakeDeps({
      loadAlerts: vi.fn(async () =>
        Array.from({ length: 10 }, (_, i) => alert(`u${i}`, "a", -10)),
      ),
      loadTargets: vi.fn(async () =>
        Array.from({ length: 10 }, (_, i) => device(`d${i}`, `u${i}`)),
      ),
      send: vi.fn(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { outcome: "ok" as const, status: 201 };
      }),
    });
    const report = await sweepPush(deps);
    expect(report).toMatchObject({ sends: 10, ok: 10 });
    expect(peak).toBe(4);
  });

  it("skips an alert whose link isn't a same-origin path", async () => {
    const bad = alert("u", "a", -10);
    bad.payload.url = "//evil.example/";
    const { deps } = fakeDeps({ loadAlerts: vi.fn(async () => [bad]) });
    await sweepPush(deps);
    expect(deps.send).not.toHaveBeenCalled();
  });
});

describe("createPushSweeper and the timer", () => {
  it("returns at once when a tick starts while the last is still sending", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { deps } = fakeDeps({
      send: vi.fn(async () => {
        await gate;
        return { outcome: "ok" as const, status: 201 };
      }),
    });
    const log = { info: vi.fn(), error: vi.fn() };
    const sweeper = createPushSweeper(deps, log);
    const first = sweeper.tick();
    await vi.waitFor(() => expect(deps.send).toHaveBeenCalled());
    expect(sweeper.running).toBe(true);
    expect(await sweeper.tick()).toBe("skipped");
    expect(deps.claim).toHaveBeenCalledTimes(1);
    release();
    expect(await first).toMatchObject({ status: "swept" });
    expect(sweeper.running).toBe(false);
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining("1 sends"));
  });

  it("logs a failed sweep without detail and recovers", async () => {
    const log = { info: vi.fn(), error: vi.fn() };
    const { deps } = fakeDeps({
      loadAlerts: vi.fn(async () => {
        throw new Error("select … https://fcm.googleapis.com/secret");
      }),
    });
    const sweeper = createPushSweeper(deps, log);
    expect(await sweeper.tick()).toBe("skipped");
    expect(log.error).toHaveBeenCalledWith("[push] sweep failed", "Error");
    expect(JSON.stringify(log.error.mock.calls)).not.toContain("fcm");
    expect(sweeper.running).toBe(false);
  });

  it("stop() clears the timer and waits for the sweep in flight", async () => {
    vi.useFakeTimers();
    try {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const { deps } = fakeDeps({
        send: vi.fn(async () => {
          await gate;
          return { outcome: "ok" as const, status: 201 };
        }),
      });
      const sweeper = createPushSweeper(deps, {
        info: vi.fn(),
        error: vi.fn(),
      });
      const timer = startPushSweepTimer(sweeper, 60_000);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(deps.claim).toHaveBeenCalledTimes(1);
      let stopped = false;
      const stopping = timer.stop().then(() => (stopped = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(stopped).toBe(false);
      release();
      await stopping;
      expect(stopped).toBe(true);
      expect(deps.record).toHaveBeenCalledTimes(1);
      // No further ticks after stop.
      await vi.advanceTimersByTimeAsync(180_000);
      expect(deps.claim).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
