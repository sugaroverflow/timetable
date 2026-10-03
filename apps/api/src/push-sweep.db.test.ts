import {
  claimPushSweepWindow,
  listPushTargets,
  loadPushAlerts,
  recordPushResults,
  subscribePush,
  type PushClaim,
  type PushTarget,
} from "@timetable/core";
import {
  activityEvents,
  comments,
  hearts,
  heartEvents,
  timeslots,
  db,
  loungeComments,
  loungeMentions,
  commentMentions,
  pushSubscriptions,
  pushSweepState,
  timetableMemberships,
  timetables,
  topics,
  users,
} from "@timetable/db";
import type { Role } from "@timetable/shared";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { PushSendResult } from "./push-transport";
import { sweepPush, type PushSweepDeps } from "./push-sweep";

/**
 * The push sweep against a real, MIGRATED Postgres: the claim's advisory
 * lock and compare-and-set, the event readers, and the result statements.
 *
 * Opt-in (`PUSH_SWEEP_DB_TEST=1` plus `DATABASE_URL`), because CI runs
 * `npm run test` before `npm run db:migrate`, so its database has no tables
 * at test time — and the api tests otherwise never touch a database. Run:
 *
 *   PUSH_SWEEP_DB_TEST=1 DATABASE_URL=postgres://… npx vitest run \
 *     src/push-sweep.db.test.ts      (from apps/api)
 *
 * It creates its own users and forums under a per-run prefix, deletes them
 * afterwards, and moves the one-row sweep cursor — use a scratch database.
 * The transport is always faked: nothing goes on the network.
 */
const enabled =
  process.env.PUSH_SWEEP_DB_TEST === "1" && Boolean(process.env.DATABASE_URL);

const run = `pst${Date.now().toString(36)}`;
const uid = (name: string) => `${run}-${name}`;
const keys = { p256dh: `B${"a".repeat(86)}`, auth: "x".repeat(22) };

async function setCursor(expression: string): Promise<void> {
  await db.execute(
    sql`update push_sweep_state set swept_until = ${sql.raw(expression)} where id = 1`,
  );
}

describe.skipIf(!enabled)("push sweep against Postgres", () => {
  const base = new Date();
  const ago = (s: number) => new Date(base.getTime() - s * 1000);
  const ids = {
    f1: "",
    topic: "",
    c1: "",
    c2: "",
    d1: "",
    l1: "",
    l2: "",
  };
  const people: Record<string, Role[]> = {
    adm: ["admin"],
    hst: ["host"],
    hs2: ["host"],
    ele: ["elector"],
    dea: ["elector"],
    late: ["host"],
  };
  const names: Record<string, string> = {
    adm: "Ed Admin",
    hst: "Ada Host",
    hs2: "Joshua Becker",
    ele: "Eve Elector",
    dea: "Dee Gone",
    late: "Lee Late",
  };

  beforeAll(async () => {
    await db.insert(users).values(
      Object.keys(people).map((p) => ({
        id: uid(p),
        name: names[p],
        email: `${uid(p)}@example.test`,
      })),
    );
    const [forum] = await db
      .insert(timetables)
      .values({
        slug: uid("forum"),
        name: "Newspeak 2026",
        privacy: "private",
        ownerId: uid("adm"),
        settings: {
          roleLabels: { host: "Faculty" },
          lounge: { enabled: true },
        },
      })
      .returning();
    ids.f1 = forum!.id;
    await db.insert(timetableMemberships).values(
      Object.entries(people).map(([p, roles]) => ({
        userId: uid(p),
        timetableId: ids.f1,
        roles,
        name: names[p],
        slug: p,
        deactivatedAt: p === "dea" ? ago(3600) : null,
      })),
    );
    const [topic] = await db
      .insert(topics)
      .values({
        timetableId: ids.f1,
        hostId: uid("hst"),
        title: "Housing policy",
        slug: "housing-policy",
        status: "published",
        publishedAt: ago(7200),
      })
      .returning();
    ids.topic = topic!.id;

    // Before the window: Dee (since deactivated) joined the chain under c1.
    const [c1] = await db
      .insert(comments)
      .values({
        topicId: ids.topic,
        authorId: uid("ele"),
        body: "Where do people live?",
        createdAt: ago(60),
      })
      .returning();
    ids.c1 = c1!.id;
    await db.insert(comments).values({
      topicId: ids.topic,
      parentId: ids.c1,
      authorId: uid("dea"),
      body: "Older reply",
      createdAt: ago(3000),
    });
    const [c2] = await db
      .insert(comments)
      .values({
        topicId: ids.topic,
        parentId: ids.c1,
        authorId: uid("hst"),
        body: "In houses, mostly.\nMore detail here.",
        createdAt: ago(50),
      })
      .returning();
    ids.c2 = c2!.id;
    // The drafting thread, @mentioning an elector: still not theirs.
    const [d1] = await db
      .insert(comments)
      .values({
        topicId: ids.topic,
        authorId: uid("adm"),
        visibility: "admin_only",
        body: "Can you tighten the title?",
        createdAt: ago(40),
      })
      .returning();
    ids.d1 = d1!.id;
    await db
      .insert(commentMentions)
      .values({ commentId: ids.d1, userId: uid("ele") });

    // The Lounge: Joshua's conversation (before the window), Ed's reply in
    // it, @mentioning Eve (an elector — never in the Lounge) and Lee (whose
    // device is newer than the reply).
    const [l1] = await db
      .insert(loungeComments)
      .values({
        timetableId: ids.f1,
        authorId: uid("hs2"),
        body: "**Nesting** — how deep?",
        createdAt: ago(3000),
      })
      .returning();
    ids.l1 = l1!.id;
    const [l2] = await db
      .insert(loungeComments)
      .values({
        timetableId: ids.f1,
        parentId: ids.l1,
        rootId: ids.l1,
        authorId: uid("adm"),
        body: "but we have infinitely nesting threads",
        createdAt: ago(30),
      })
      .returning();
    ids.l2 = l2!.id;
    await db.insert(loungeMentions).values([
      { commentId: ids.l2, userId: uid("ele") },
      { commentId: ids.l2, userId: uid("late") },
    ]);

    // One device each; all but Lee's from before the events.
    for (const p of Object.keys(people)) {
      const result = await subscribePush(uid(p), {
        endpoint: `https://fcm.googleapis.com/fcm/send/${uid(p)}`,
        ...keys,
      });
      expect(result.ok).toBe(true);
    }
    await db
      .update(pushSubscriptions)
      .set({ createdAt: ago(3600) })
      .where(
        inArray(
          pushSubscriptions.userId,
          Object.keys(people)
            .filter((p) => p !== "late")
            .map(uid),
        ),
      );
  });

  afterAll(async () => {
    if (ids.f1) await db.delete(timetables).where(eq(timetables.id, ids.f1));
    await db.delete(users).where(
      inArray(
        users.id,
        Object.keys(people).map((p) => uid(p)),
      ),
    );
  });

  it("claims windows that never overlap, even when two runs race", async () => {
    await setCursor("now() - interval '30 seconds'");
    const [a, b] = await Promise.all([
      claimPushSweepWindow(),
      claimPushSweepWindow(),
    ]);
    const claimed = [a, b].filter(
      (c): c is Extract<PushClaim, { status: "claimed" }> =>
        c.status === "claimed",
    );
    expect(claimed.length).toBeGreaterThanOrEqual(1);
    if (claimed.length === 2) {
      const [x, y] = claimed
        .map((c) => c.window)
        .sort((p, q) => p.from.getTime() - q.from.getTime());
      expect(y!.from.getTime()).toBeGreaterThanOrEqual(x!.to.getTime());
    } else {
      expect([a, b].map((c) => c.status)).toEqual(
        expect.arrayContaining(["claimed"]),
      );
    }
    // Claiming again straight away finds nothing new (or a sliver).
    const again = await claimPushSweepWindow();
    if (again.status === "claimed")
      expect(again.window.from.getTime()).toBeGreaterThanOrEqual(
        claimed[claimed.length - 1]!.window.from.getTime(),
      );
  });

  it("reports busy while another transaction holds the sweep lock", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const isLocked = new Promise<void>((r) => (locked = r));
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(368000, 0)`);
      locked();
      await held;
    });
    await isLocked;
    expect(await claimPushSweepWindow()).toEqual({ status: "busy" });
    release();
    await holder;
  });

  it("starts at most ten minutes back and lags ten seconds", async () => {
    await setCursor("now() - interval '3 hours'");
    const claim = await claimPushSweepWindow();
    expect(claim.status).toBe("claimed");
    if (claim.status !== "claimed") return;
    const { from, to } = claim.window;
    expect(to.getTime() - from.getTime()).toBe(10 * 60 * 1000);
    const lag = Date.now() - to.getTime();
    expect(lag).toBeGreaterThanOrEqual(9_000);
    expect(lag).toBeLessThan(20_000);
    const [row] = await db
      .select({ sweptUntil: pushSweepState.sweptUntil })
      .from(pushSweepState);
    expect(row!.sweptUntil.getTime()).toBe(to.getTime());
  });

  it("alerts exactly the people the kind map and visibility allow", async () => {
    const window = { from: ago(600), to: new Date(base.getTime() + 60_000) };
    const sent: { user: string; payload: Record<string, string> }[] = [];
    const deps: PushSweepDeps = {
      claim: async () => ({ status: "claimed", window }),
      loadAlerts: loadPushAlerts,
      loadTargets: async (userIds) =>
        // Only this run's people: a shared scratch DB may hold others.
        (await listPushTargets(userIds)).filter((t) =>
          t.userId.startsWith(run),
        ),
      send: vi.fn(async (target: PushTarget, json: string) => {
        sent.push({
          user: target.userId.slice(run.length + 1),
          payload: JSON.parse(json),
        });
        return { outcome: "ok", status: 201 } satisfies PushSendResult;
      }),
      record: recordPushResults,
      paused: false,
    };
    const report = await sweepPush(deps);
    expect(report).toMatchObject({ status: "swept" });
    const by = (u: string) =>
      sent
        .filter((s) => s.user === u)
        .map((s) => s.payload.title)
        .sort();

    // Ada hosts the topic: Eve's comment and the drafting thread (her own
    // reply c2 never alerts her).
    expect(by("hst")).toEqual([
      "Ed Admin in Housing policy",
      "Eve Elector in Housing policy",
    ]);
    // Eve: Ada's reply in her chain — not the drafting thread that
    // @mentions her, not the Lounge post that @mentions her.
    expect(by("ele")).toEqual(["Ada Host in Housing policy"]);
    const eve = sent.find((s) => s.user === "ele")!.payload;
    expect(eve.body).toBe("In houses, mostly.");
    expect(eve.url).toBe(
      `/f/${run}-forum/hst/housing-policy?tab=comments&topic=${ids.topic}#comment-${ids.c2}`,
    );
    // Joshua: a reply in his Lounge conversation.
    expect(sent.filter((s) => s.user === "hs2").map((s) => s.payload)).toEqual([
      {
        title: "Ed Admin in Faculty Lounge",
        body: "but we have infinitely nesting threads",
        url: `/f/${run}-forum/lounge?c=${ids.l1}&reply=${ids.l2}#comment-${ids.l2}`,
        tag: `lounge:${ids.l1}`,
      },
    ]);
    // Dee is deactivated (in c1's chain); Lee's device is newer than the
    // reply that mentions him; Ed wrote what's left.
    expect(by("dea")).toEqual([]);
    expect(by("late")).toEqual([]);
    expect(by("adm")).toEqual([]);

    // Success stamped on the devices that were sent to.
    const rows = await db
      .select({
        userId: pushSubscriptions.userId,
        lastSentAt: pushSubscriptions.lastSentAt,
      })
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, [uid("hst"), uid("dea")]));
    const stamped = Object.fromEntries(
      rows.map((r) => [r.userId, r.lastSentAt !== null]),
    );
    expect(stamped).toEqual({ [uid("hst")]: true, [uid("dea")]: false });
  });

  it("reads the session, ❤️, topic, calendar and member events", async () => {
    await db
      .update(timetables)
      .set({
        settings: {
          roleLabels: { host: "Faculty" },
          lounge: { enabled: true },
          calendar: { enabled: true },
        },
      })
      .where(eq(timetables.id, ids.f1));
    // Broadcast kinds are off by default: switch some on.
    const pushOn = async (p: string, push: Record<string, boolean>) =>
      db
        .update(timetableMemberships)
        .set({ digestSettings: { push } })
        .where(eq(timetableMemberships.userId, uid(p)));
    await pushOn("hst", { hearts: true, slotReleases: true });
    await pushOn("adm", { pendingReview: true, newMembers: true });
    await pushOn("ele", { newTopics: true });

    const at = ago(20);
    const [ready, sentBack] = await db
      .insert(topics)
      .values([
        {
          timetableId: ids.f1,
          hostId: uid("hs2"),
          title: "Ready draft",
          slug: "ready-draft",
          readyAt: at,
        },
        {
          timetableId: ids.f1,
          hostId: uid("hs2"),
          title: "Sent back",
          slug: "sent-back",
        },
      ])
      .returning();
    await db
      .insert(hearts)
      .values({ topicId: ids.topic, userId: uid("ele"), createdAt: ago(5000) });
    await db.insert(heartEvents).values({
      timetableId: ids.f1,
      topicId: ids.topic,
      userId: uid("ele"),
      kind: "heart",
      action: "add",
      createdAt: at,
    });
    const startsAt = new Date(base.getTime() + 7 * 86_400_000);
    await db.insert(timeslots).values({
      timetableId: ids.f1,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      createdById: uid("adm"),
      createdAt: at,
    });
    const event = (
      actor: string,
      action: string,
      payload: Record<string, unknown>,
    ) => ({
      timetableId: ids.f1,
      actorId: uid(actor),
      action,
      payload,
      createdAt: at,
    });
    await db.insert(activityEvents).values([
      event("adm", "slot.confirm", {
        slotId: "s",
        startsAt: startsAt.toISOString(),
        location: "Room 2",
        topicId: ids.topic,
        title: "Housing policy",
      }),
      event("adm", "topic.publish", { topicId: ids.topic }),
      event("hs2", "topic.ready", { topicId: ready!.id }),
      event("adm", "topic.unready", { topicId: sentBack!.id }),
      event("late", "member.first_login", {}),
    ]);

    const alerts = await loadPushAlerts({
      from: ago(25),
      to: new Date(base.getTime() + 60_000),
    });
    const by = (p: string) =>
      alerts
        .filter((a) => a.userId === uid(p))
        .map((a) => `${a.kind ?? "override"}: ${a.payload.title}`)
        .sort();
    expect(by("ele")).toEqual([
      "newTopics: Ada Host published a topic",
      "sessions: Session confirmed: Housing policy",
    ]);
    expect(by("hst")).toEqual([
      "hearts: A new ❤️ on Housing policy",
      "slotReleases: New dates on the calendar",
    ]);
    expect(by("adm")).toEqual([
      "newMembers: Lee Late joined Newspeak 2026",
      "pendingReview: Joshua Becker marked a topic ready",
    ]);
    expect(by("hs2")).toEqual([
      // Slot releases are off by default for Joshua.
      "override: Ed Admin moved your topic back to drafting",
    ]);
    expect(by("dea")).toEqual([]);
  });

  it("deletes gone devices and drops one at its twentieth failure", async () => {
    const targets = await listPushTargets([uid("adm"), uid("hs2"), uid("dea")]);
    const id = (p: string) => targets.find((t) => t.userId === uid(p))!.id;
    await db
      .update(pushSubscriptions)
      .set({ failureCount: 19 })
      .where(eq(pushSubscriptions.id, id("hs2")));
    await db
      .update(pushSubscriptions)
      .set({ failureCount: 5 })
      .where(eq(pushSubscriptions.id, id("dea")));
    await recordPushResults({
      ok: [],
      gone: [id("adm")],
      failed: [id("hs2"), id("dea")],
    });
    const left = await db
      .select({ id: pushSubscriptions.id, n: pushSubscriptions.failureCount })
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.id, [id("adm"), id("hs2"), id("dea")]));
    expect(left).toEqual([{ id: id("dea"), n: 6 }]);

    await recordPushResults({ ok: [id("dea")], gone: [], failed: [] });
    const [reset] = await db
      .select({ n: pushSubscriptions.failureCount })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.id, id("dea")));
    expect(reset!.n).toBe(0);
  });
});
