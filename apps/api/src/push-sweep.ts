import {
  claimPushSweepWindow,
  listPushTargets,
  loadPushAlerts,
  recordPushResults,
  type PushAlert,
  type PushClaim,
  type PushDeliveryResults,
  type PushTarget,
  type PushWindow,
} from "@timetable/core";
import { serializePushPayload, type PushPayload } from "@timetable/shared";

import type { PushConfig } from "./push-config";
import {
  sendPush,
  type PushSendResult,
  type PushUrgency,
} from "./push-transport";

/**
 * The once-a-minute push sweep (docs/web-push-plan.md §3.2). Each run
 * claims a time window (core `claimPushSweepWindow`: advisory lock +
 * compare-and-set, so a window belongs to exactly one run on any number of
 * instances), reads what happened in it once for everybody, decides per
 * recipient, fans out to their devices, and records the outcomes.
 *
 * At-most-once by design: the window is committed BEFORE anything is
 * sent, so a crash mid-send loses that minute's unsent alerts rather than
 * buzzing anyone twice. No database connection is held while sending.
 *
 * The event code paths (`addComment`, the Lounge writes, slot mutations,
 * `setTopicReady`) are untouched: the sweep only reads.
 */

/** Alerts per device per run before the rest fold into one "and n more". */
export const PUSH_ALERTS_PER_DEVICE = 3;

/** Sends in flight at once (plan §3.2 step 5). */
export const PUSH_SEND_CONCURRENCY = 4;

/** How often the timer runs a sweep. */
export const PUSH_SWEEP_INTERVAL_MS = 60_000;

/** One send: a device and the payload for it. */
export type PushDeviceSend = {
  target: PushTarget;
  payload: PushPayload;
  urgency: PushUrgency;
};

export type PushSweepDeps = {
  claim: () => Promise<PushClaim>;
  loadAlerts: (window: PushWindow) => Promise<PushAlert[]>;
  loadTargets: (userIds: string[]) => Promise<PushTarget[]>;
  send: (
    target: PushTarget,
    payload: string,
    urgency: PushUrgency,
  ) => Promise<PushSendResult>;
  record: (results: PushDeliveryResults) => Promise<void>;
  /** PUSH_PAUSED: claim (so the cursor keeps moving), send nothing. */
  paused: boolean;
};

export type PushSweepReport =
  | { status: "busy" | "raced" | "empty" }
  | {
      status: "paused";
      window: PushWindow;
    }
  | {
      status: "swept";
      window: PushWindow;
      alerts: number;
      sends: number;
      ok: number;
      gone: number;
      failed: number;
    };

/** "and n more in {forum}" for one device, opening that forum's
 * Notifications page; when the rest span several forums, "and n more" and
 * the forum chooser (`/notifications`). */
function overflowPayload(rest: PushAlert[]): PushPayload {
  const forums = new Map(rest.map((a) => [a.forum.slug, a.forum.name]));
  const n = rest.length;
  if (forums.size === 1) {
    const [slug, name] = [...forums][0]!;
    return {
      title: `And ${n} more in ${name}`,
      body: "",
      url: `/f/${slug}/notifications`,
      tag: `more:${slug}`,
    };
  }
  return {
    title: `And ${n} more`,
    body: "",
    url: "/notifications",
    tag: "more",
  };
}

/**
 * Plan §3.2 step 5, the pure part: group alerts by device, keep ONE alert
 * per thread tag (the newest — a burst in one thread replaces rather than
 * stacks, as the tag does on the device), never anything from before the
 * device subscribed, at most `PUSH_ALERTS_PER_DEVICE` per device with the
 * aimed-at-you (high-urgency) ones first and newest first within that, and
 * one "and n more" for the rest.
 */
export function planDeviceSends(
  alerts: readonly PushAlert[],
  targets: readonly PushTarget[],
  options: { perDevice?: number } = {},
): PushDeviceSend[] {
  const perDevice = options.perDevice ?? PUSH_ALERTS_PER_DEVICE;
  const byUser = new Map<string, PushAlert[]>();
  for (const a of alerts)
    byUser.set(a.userId, [...(byUser.get(a.userId) ?? []), a]);
  return targets.flatMap((target) =>
    deviceSends(target, byUser.get(target.userId) ?? [], perDevice),
  );
}

/** The newest alert per thread tag. */
function newestPerTag(alerts: readonly PushAlert[]): PushAlert[] {
  const byTag = new Map<string, PushAlert>();
  for (const a of alerts) {
    const held = byTag.get(a.payload.tag);
    if (!held || a.at > held.at) byTag.set(a.payload.tag, a);
  }
  return [...byTag.values()];
}

/** Aimed-at-you (high urgency) first, then newest first. */
function byPriority(a: PushAlert, b: PushAlert): number {
  return (
    Number(b.urgency === "high") - Number(a.urgency === "high") ||
    b.at.getTime() - a.at.getTime()
  );
}

function deviceSends(
  target: PushTarget,
  alerts: readonly PushAlert[],
  perDevice: number,
): PushDeviceSend[] {
  // Events from before this device subscribed never alert on it.
  const fresh = alerts.filter((a) => a.at > target.createdAt);
  const ordered = newestPerTag(fresh).sort(byPriority);
  const sends: PushDeviceSend[] = ordered
    .slice(0, perDevice)
    .map((a) => ({ target, payload: a.payload, urgency: a.urgency }));
  const rest = ordered.slice(perDevice);
  if (rest.length > 0)
    sends.push({
      target,
      payload: overflowPayload(rest),
      urgency: rest.some((a) => a.urgency === "high") ? "high" : "normal",
    });
  return sends;
}

/** Run `work` over `items` with at most `limit` in flight. */
export async function withConcurrency<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (next < items.length) {
        const item = items[next++]!;
        await work(item);
      }
    })(),
  );
  await Promise.all(lanes);
}

/** Outcome → which result list. `rejected` counts as a failure too, so a
 * subscription made under another VAPID key (403) ages out at 20. */
function bucketFor(result: PushSendResult): keyof PushDeliveryResults {
  if (result.outcome === "ok") return "ok";
  if (result.outcome === "gone") return "gone";
  return "failed";
}

/** One sweep (plan §3.2 steps 1–6). */
export async function sweepPush(deps: PushSweepDeps): Promise<PushSweepReport> {
  const claim = await deps.claim();
  if (claim.status !== "claimed") return { status: claim.status };
  const { window } = claim;
  // Kill switch: the window is claimed — the cursor advances — and nothing
  // is read or sent, so unpausing releases no backlog.
  if (deps.paused) return { status: "paused", window };

  const alerts = await deps.loadAlerts(window);
  const userIds = [...new Set(alerts.map((a) => a.userId))];
  const targets = userIds.length > 0 ? await deps.loadTargets(userIds) : [];
  const sends = planDeviceSends(alerts, targets);

  // Per device: the worst outcome of its sends wins (gone > failed > ok).
  const outcome = new Map<string, keyof PushDeliveryResults>();
  const rank = { ok: 0, failed: 1, gone: 2 } as const;
  await withConcurrency(sends, PUSH_SEND_CONCURRENCY, async (s) => {
    const prior = outcome.get(s.target.id);
    if (prior === "gone") return; // dead device: don't keep knocking
    const json = serializePushPayload(s.payload);
    if (json === null) return; // unsafe url or unfittable: skip this alert
    const result = await deps.send(s.target, json, s.urgency);
    const bucket = bucketFor(result);
    const held = outcome.get(s.target.id);
    if (!held || rank[bucket] > rank[held]) outcome.set(s.target.id, bucket);
  });

  const results: PushDeliveryResults = { ok: [], gone: [], failed: [] };
  for (const [id, bucket] of outcome) results[bucket].push(id);
  await deps.record(results);
  return {
    status: "swept",
    window,
    alerts: alerts.length,
    sends: sends.length,
    ok: results.ok.length,
    gone: results.gone.length,
    failed: results.failed.length,
  };
}

/** The production wiring: core's readers and recorder, the real transport. */
export function pushSweepDeps(config: PushConfig): PushSweepDeps {
  return {
    claim: claimPushSweepWindow,
    loadAlerts: loadPushAlerts,
    loadTargets: listPushTargets,
    send: (target, payload, urgency) =>
      sendPush(target, payload, config, { urgency }),
    record: recordPushResults,
    paused: config.paused,
  };
}

export type PushSweeper = {
  /** Run one sweep unless one is already running (then return at once). */
  tick: () => Promise<PushSweepReport | "skipped">;
  /** Whether a sweep is in flight. */
  readonly running: boolean;
};

/** The in-process `running` flag (plan §3.2 "Why nothing is sent twice"): a
 * tick that starts while the last is still sending returns at once. Errors
 * are logged and swallowed — the next tick tries again, and the claimed
 * window is not retried (at-most-once). */
export function createPushSweeper(
  deps: PushSweepDeps,
  log: {
    info: (msg: string) => void;
    error: (msg: string, err?: unknown) => void;
  } = console,
): PushSweeper {
  let running = false;
  return {
    get running() {
      return running;
    },
    async tick() {
      if (running) return "skipped";
      running = true;
      try {
        const report = await sweepPush(deps);
        // Counts only — never an endpoint, a user or a payload.
        if (report.status === "swept" && report.sends > 0)
          log.info(
            `[push] sweep: ${report.alerts} alerts, ${report.sends} sends, ${report.ok} ok, ${report.gone} gone, ${report.failed} failed`,
          );
        return report;
      } catch (err) {
        // Never the endpoint: errors from core are sanitized messages, and
        // the transport never throws.
        log.error(
          "[push] sweep failed",
          err instanceof Error ? err.name : "error",
        );
        return "skipped";
      } finally {
        running = false;
      }
    },
  };
}

export type PushSweepTimer = {
  /** Stop the timer and wait for an in-flight sweep (the SIGTERM drain). */
  stop: () => Promise<void>;
};

/** Start the once-a-minute timer. Only call when `env.push` is set. */
export function startPushSweepTimer(
  sweeper: PushSweeper,
  intervalMs = PUSH_SWEEP_INTERVAL_MS,
): PushSweepTimer {
  let inFlight: Promise<unknown> | null = null;
  const run = () => {
    if (sweeper.running) return;
    const p = sweeper.tick();
    inFlight = p;
    void p.finally(() => {
      if (inFlight === p) inFlight = null;
    });
  };
  const timer = setInterval(run, intervalMs);
  // Never hold the process open by itself.
  timer.unref();
  return {
    async stop() {
      clearInterval(timer);
      if (inFlight) await inFlight;
    },
  };
}
