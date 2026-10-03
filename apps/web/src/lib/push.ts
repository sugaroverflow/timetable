"use client";

/**
 * push-device (Web Push step 4, docs/web-push-plan.md §1 and §3.4): what
 * this browser can do about alerts, and the two gestures that change it.
 *
 * - Detection is pure (`detectPushSupport`, from a `PushEnvironment`
 *   snapshot) so the iPhone/iPad rules are unit-tested; `readEnvironment`
 *   takes the snapshot from the real browser.
 * - The result lives in a module-level store (`usePushDevice`), so every
 *   component that cares — the alerts line now, step 6's "Get
 *   Notifications" sidebar link later — sees a Turn on/off without a
 *   reload. Like comment-draft-store, it dies with the JS context.
 * - Nothing here runs at import or on render: callers start detection
 *   from an effect (after hydration), and only when the GraphQL
 *   `pushPublicKey` is non-null — no keys, no worker, no prompt.
 * - Permission is asked only inside `turnOnPush`, which must be called
 *   straight from a click: `Notification.requestPermission()` is its
 *   first await, as iOS requires.
 */

import { useSyncExternalStore } from "react";

import { clientApi } from "@/lib/clientApi";
import { clientGql } from "@/lib/clientGraphql";

// ---------------------------------------------------------------------------
// Pure detection

/** What this device can do, before asking the server anything. */
export type PushSupport =
  /** No service worker / PushManager / Notification, not a secure
   * context, or iOS before 16.4 — alerts can't work here at all. */
  | "unsupported"
  /** iPhone/iPad in a browser tab: Apple allows push only for the app
   * added to the Home Screen and opened from its icon. */
  | "ios-tab"
  /** The person blocked notifications for this site. Never re-prompted. */
  | "denied"
  /** Push works here; whether this device is on is the server's answer. */
  | "ready";

/** Everything detection reads from the browser, as plain values. */
export type PushEnvironment = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** `navigator.standalone` (iOS Safari's own flag). */
  navigatorStandalone: boolean;
  /** `matchMedia("(display-mode: standalone)")` — installed apps elsewhere. */
  displayStandalone: boolean;
  secureContext: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  /** `Notification.permission`, or null without a Notification API. */
  permission: NotificationPermission | null;
};

/** iPhone, iPod or iPad — including iPads that report as a Mac (iPadOS 13+
 * Safari sends a desktop user agent; a touch screen gives it away, since
 * no Mac has one). */
export function isIOSDevice(
  env: Pick<PushEnvironment, "userAgent" | "platform" | "maxTouchPoints">,
): boolean {
  if (/iPad|iPhone|iPod/.test(env.userAgent)) return true;
  const macLike =
    env.platform === "MacIntel" || /Macintosh/.test(env.userAgent);
  return macLike && env.maxTouchPoints > 1;
}

/** The iOS/iPadOS version as [major, minor], or null when the user agent
 * doesn't say. iPhones carry "OS 17_4 like Mac OS X"; desktop-mode iPads
 * carry Safari's "Version/17.4". */
export function iosVersion(userAgent: string): [number, number] | null {
  const os = /OS (\d+)[_.](\d+)/.exec(userAgent);
  if (os && /iPad|iPhone|iPod/.test(userAgent)) {
    return [Number(os[1]), Number(os[2])];
  }
  const safari = /Version\/(\d+)\.(\d+)/.exec(userAgent);
  if (safari) return [Number(safari[1]), Number(safari[2])];
  return null;
}

/** Web push arrived on iOS/iPadOS 16.4. An unknown version gets the
 * benefit of the doubt: the Home Screen steps are harmless if it's older. */
export function iosSupportsPush(userAgent: string): boolean {
  const version = iosVersion(userAgent);
  if (!version) return true;
  const [major, minor] = version;
  return major > 16 || (major === 16 && minor >= 4);
}

/** Running as the installed Home Screen / desktop app, not in a tab. */
export function isStandalone(
  env: Pick<PushEnvironment, "navigatorStandalone" | "displayStandalone">,
): boolean {
  return env.navigatorStandalone || env.displayStandalone;
}

export function detectPushSupport(env: PushEnvironment): PushSupport {
  const ios = isIOSDevice(env);
  if (ios && !iosSupportsPush(env.userAgent)) return "unsupported";
  // Checked before the APIs: an iPhone tab has no PushManager at all, and
  // the answer there is "add it to your Home Screen", not "unsupported".
  if (ios && !isStandalone(env)) return "ios-tab";
  if (
    !env.secureContext ||
    !env.hasServiceWorker ||
    !env.hasPushManager ||
    !env.hasNotification
  ) {
    return "unsupported";
  }
  if (env.permission === "denied") return "denied";
  return "ready";
}

/** Browser and system names, first match wins — so Edge and Samsung come
 * before the Chrome they also claim to be, and Chrome before Safari. */
const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/(Firefox|FxiOS)\//, "Firefox"],
  [/(Chrome|CriOS|Chromium)\//, "Chrome"],
  [/Safari\//, "Safari"],
];
const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPod/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Windows/, "Windows"],
  [/Macintosh|Mac OS X/, "Mac"],
  [/Linux/, "Linux"],
];

function firstMatch(table: [RegExp, string][], ua: string): string | null {
  return table.find(([re]) => re.test(ua))?.[1] ?? null;
}

/** A short device name for the device list ("Chrome on Android") — never
 * the raw user agent. Null when nothing is recognised. */
export function deviceLabel(
  env: Pick<PushEnvironment, "userAgent" | "platform" | "maxTouchPoints">,
): string | null {
  const browser = firstMatch(BROWSERS, env.userAgent);
  const system =
    isIOSDevice(env) && !/iPhone|iPod/.test(env.userAgent)
      ? "iPad"
      : firstMatch(SYSTEMS, env.userAgent);
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system;
}

/** The VAPID public key (base64url) as the bytes `subscribe()` wants. */
export function applicationServerKey(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const decoded = atob(padded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

/** The bytes of a server key, whichever form it arrives in: the base64url
 * string GraphQL `pushPublicKey` returns, or the ArrayBuffer (or view) the
 * browser keeps in `subscription.options.applicationServerKey`. Comparing
 * the two forms directly is always "different" — decode both first. Null
 * when there is no key or it doesn't decode. */
export function serverKeyBytes(
  key: string | BufferSource | null | undefined,
): Uint8Array | null {
  if (key === null || key === undefined) return null;
  if (typeof key === "string") {
    try {
      return applicationServerKey(key);
    } catch {
      return null;
    }
  }
  if (ArrayBuffer.isView(key)) {
    return new Uint8Array(key.buffer, key.byteOffset, key.byteLength);
  }
  return new Uint8Array(key);
}

/** How a browser subscription's server key compares with ours (#385,
 * disagreement 1): a subscription made under an older VAPID key is refused
 * on every send, so it must be replaced, not re-posted.
 * - "same": made with the current key — reuse it;
 * - "different": made with another key — stale;
 * - "unknown": the browser doesn't say (no `options`, or a null key). */
export type ServerKeyMatch = "same" | "different" | "unknown";

export function compareServerKey(
  subscription: Pick<PushSubscription, "options">,
  publicKey: string,
): ServerKeyMatch {
  const theirs = serverKeyBytes(subscription.options?.applicationServerKey);
  const ours = serverKeyBytes(publicKey);
  if (!theirs || !ours) return "unknown";
  if (theirs.length !== ours.length) return "different";
  return theirs.every((byte, i) => byte === ours[i]) ? "same" : "different";
}

/** What identifies a subscription to the server: its endpoint and payload
 * keys. #379's call 10 — re-send only when one of these changes. */
export type SubscriptionIdentity = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function subscriptionIdentity(
  json: PushSubscriptionJSON,
): SubscriptionIdentity | null {
  const { endpoint, keys } = json;
  if (!endpoint || !keys?.p256dh || !keys?.auth) return null;
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

/** A SHA-256 over the endpoint and both keys: it changes when any of them
 * does, and what this page keeps in localStorage is a hash, not the
 * subscription itself. */
export async function identityFingerprint(
  id: SubscriptionIdentity,
): Promise<string> {
  const text = `${id.endpoint}\n${id.p256dh}\n${id.auth}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/** Whether the page should send the subscription again without being
 * asked. Only when this device was turned on for this person before (we
 * hold what we last sent) and the browser's subscription has changed since
 * — a rotated endpoint or rotated keys. Never on an ordinary page view:
 * with many tabs open that would spend the 30-an-hour subscribe limit. */
export function shouldResend(
  lastSent: string | null,
  currentFingerprint: string,
): boolean {
  return lastSent !== null && lastSent !== currentFingerprint;
}

// ---------------------------------------------------------------------------
// The store

/** The device state every push control renders from. "unknown" is the
 * server render and the first client render, so nothing mismatches on
 * hydration; detection replaces it from an effect. */
export type PushDeviceState =
  | "unknown"
  | "unsupported"
  | "ios-tab"
  | "denied"
  | "off"
  | "on";

let deviceState: PushDeviceState = "unknown";
const listeners = new Set<() => void>();

export function getPushDeviceState(): PushDeviceState {
  return deviceState;
}

export function setPushDeviceState(next: PushDeviceState): void {
  if (next === deviceState) return;
  deviceState = next;
  for (const listener of listeners) listener();
}

export function subscribePushDevice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The device state, re-rendering on every change. */
export function usePushDevice(): PushDeviceState {
  return useSyncExternalStore(
    subscribePushDevice,
    getPushDeviceState,
    () => "unknown",
  );
}

/** Test seam: back to the pre-detection state. */
export function resetPushDeviceForTests(): void {
  deviceState = "unknown";
  inflight = null;
  listeners.clear();
}

// ---------------------------------------------------------------------------
// The browser

/** The worker's own address and scope (plan §2: served with no-cache from
 * apps/web/public, scope "/"). */
export const SERVICE_WORKER_URL = "/sw.js";
export const SERVICE_WORKER_SCOPE = "/";

export function readEnvironment(): PushEnvironment {
  const nav = navigator as Navigator & { standalone?: boolean };
  let displayStandalone = false;
  try {
    displayStandalone = window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    displayStandalone = false;
  }
  const hasNotification = "Notification" in window;
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    navigatorStandalone: nav.standalone === true,
    displayStandalone,
    secureContext: window.isSecureContext,
    hasServiceWorker: "serviceWorker" in nav,
    hasPushManager: "PushManager" in window,
    hasNotification,
    permission: hasNotification ? Notification.permission : null,
  };
}

/** Register (or reuse) the worker. Only called from `turnOnPush`: until
 * someone asks for alerts, no worker is installed. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
    scope: SERVICE_WORKER_SCOPE,
    // Always fetch sw.js itself from the network when checking for an
    // update (the no-cache header says the same to any cache between).
    updateViaCache: "none",
  });
  return navigator.serviceWorker.ready;
}

/** This browser's current push subscription, without registering
 * anything: no registration means no subscription. */
async function currentSubscription(): Promise<PushSubscription | null> {
  const registration =
    await navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE);
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** The worker's registration and its subscription, or null without one. */
async function currentRegistrationAndSubscription(): Promise<{
  registration: ServiceWorkerRegistration;
  subscription: PushSubscription;
} | null> {
  const registration =
    await navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE);
  const subscription = await registration?.pushManager.getSubscription();
  return registration && subscription ? { registration, subscription } : null;
}

const SENT_KEY_PREFIX = "topic.push.sent.";

/** What this page last sent the server for this person on this device, so
 * a changed endpoint or key can be re-sent (and an unchanged one not). */
function readLastSent(userId: string): string | null {
  try {
    return window.localStorage.getItem(SENT_KEY_PREFIX + userId);
  } catch {
    return null;
  }
}

function writeLastSent(userId: string, value: string | null): void {
  try {
    if (value === null)
      window.localStorage.removeItem(SENT_KEY_PREFIX + userId);
    else window.localStorage.setItem(SENT_KEY_PREFIX + userId, value);
  } catch {
    // Storage blocked (private window): we just won't auto-resend.
  }
}

const ENABLED_QUERY = `query PushDeviceEnabled($endpoint: String!) {
  myPushDeviceEnabled(endpoint: $endpoint)
}`;

/** Ask the server whether THIS device is on for the signed-in person. */
async function serverHasDevice(endpoint: string): Promise<boolean> {
  const data = await clientGql<{ myPushDeviceEnabled: boolean }>(
    ENABLED_QUERY,
    { endpoint },
  );
  return data.myPushDeviceEnabled;
}

/** Why a turn-on or turn-off didn't happen, in words for the person. */
export class PushActionError extends Error {}

type SubscribeReply = { error?: string; reason?: string };

/** POST the subscription. Resolves to "taken" when another account holds
 * this browser's endpoint (#377 call 4: the caller re-subscribes for a
 * fresh one). */
async function sendSubscription(
  subscription: PushSubscription,
): Promise<"ok" | "taken"> {
  const json = subscription.toJSON();
  const response = await clientApi("/api/push-subscriptions", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      label: deviceLabel(readEnvironment()) ?? undefined,
    }),
  });
  if (response.ok) return "ok";
  const reply = (await response.json().catch(() => ({}))) as SubscribeReply;
  if (response.status === 409 && reply.reason === "taken") return "taken";
  throw new PushActionError(reply.error ?? TURN_ON_FAILED);
}

/** Drop a subscription made under another server key and make a fresh one
 * with ours. The server's row for the old endpoint is removed too, best
 * effort: it would otherwise hold one of the 10 device places until its
 * sends had failed 20 times. */
async function replaceSubscription(
  registration: ServiceWorkerRegistration,
  stale: PushSubscription,
  publicKey: string,
): Promise<PushSubscription> {
  const oldEndpoint = stale.endpoint;
  await stale.unsubscribe().catch(() => false);
  const fresh = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(publicKey),
  });
  if (fresh.endpoint !== oldEndpoint) {
    await clientApi("/api/push-subscriptions", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: oldEndpoint }),
    }).catch(() => null);
  }
  return fresh;
}

export const TURN_ON_FAILED = "Couldn't turn alerts on. Please try again.";
export const TURN_OFF_FAILED = "Couldn't turn alerts off. Please try again.";

let inflight: Promise<PushDeviceState> | null = null;

/**
 * Work out this device's state and publish it to the store. Shared: two
 * components mounting together run one detection. Re-sends the
 * subscription only when it changed since this page last sent it.
 */
export function refreshPushDevice(
  userId: string,
  publicKey: string,
): Promise<PushDeviceState> {
  inflight ??= detectDevice(userId, publicKey)
    .catch((): PushDeviceState => "off")
    .then((state) => {
      setPushDeviceState(state);
      return state;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Page load, a subscription made under an older server key (the VAPID pair
 * changed): every send to it is refused, so re-posting it would only start
 * the 20-failure cycle again. When it is this person's — we sent it, or the
 * server holds it — and the browser already granted permission (so
 * subscribing can't prompt), replace it now and return the new state.
 * Only a definite "different": a browser that doesn't report the key would
 * otherwise resubscribe on every page view; Turn on handles that case.
 * Null means nothing was stale and detection carries on.
 */
async function replaceStaleOnLoad(
  userId: string,
  publicKey: string,
  registration: ServiceWorkerRegistration,
  subscription: PushSubscription,
  lastSent: string | null,
): Promise<PushDeviceState | null> {
  if (compareServerKey(subscription, publicKey) !== "different") return null;
  if (Notification.permission !== "granted") return null;
  if (lastSent === null && !(await serverHasDevice(subscription.endpoint))) {
    return null;
  }
  const fresh = await replaceSubscription(
    registration,
    subscription,
    publicKey,
  );
  const result = await sendSubscription(fresh);
  const identity = subscriptionIdentity(fresh.toJSON());
  writeLastSent(
    userId,
    result === "ok" && identity ? await identityFingerprint(identity) : null,
  );
  return result === "ok" ? "on" : "off";
}

async function detectDevice(
  userId: string,
  publicKey: string,
): Promise<PushDeviceState> {
  const support = detectPushSupport(readEnvironment());
  if (support !== "ready") return support;

  const current = await currentRegistrationAndSubscription();
  if (!current) return "off";
  const { registration, subscription } = current;
  const identity = subscriptionIdentity(subscription.toJSON());
  if (!identity) return "off";

  const lastSent = readLastSent(userId);

  return (
    (await replaceStaleOnLoad(
      userId,
      publicKey,
      registration,
      subscription,
      lastSent,
    )) ?? (await reconcileDevice(userId, subscription, identity, lastSent))
  );
}

/** The subscription is made under the current key (or the browser doesn't
 * say): re-send it if it rotated since we last sent it, otherwise ask the
 * server whether it is on. */
async function reconcileDevice(
  userId: string,
  subscription: PushSubscription,
  identity: SubscriptionIdentity,
  lastSent: string | null,
): Promise<PushDeviceState> {
  const fingerprint = await identityFingerprint(identity);
  if (shouldResend(lastSent, fingerprint)) {
    // The browser rotated the endpoint or keys since this person turned
    // alerts on here: tell the server about the new one.
    const result = await sendSubscription(subscription);
    // "taken": another account turned alerts on in this browser since.
    // Forget ours, so later page views don't keep re-sending.
    writeLastSent(userId, result === "ok" ? fingerprint : null);
    return result === "ok" ? "on" : "off";
  }
  const on = await serverHasDevice(identity.endpoint);
  // The server forgot this device (it stopped accepting alerts, or it was
  // turned off elsewhere): stop treating it as ours.
  if (!on && lastSent !== null) writeLastSent(userId, null);
  // First visit after storage was cleared: adopt what the server holds.
  if (on && lastSent === null) writeLastSent(userId, fingerprint);
  return on ? "on" : "off";
}

/**
 * Turn alerts on for this device. Call it directly from a click: the
 * permission prompt is its first await. Resolves to the new state, or
 * throws a `PushActionError` whose message is fit to show.
 */
export async function turnOnPush(
  publicKey: string,
  userId: string,
): Promise<PushDeviceState> {
  const permission = await Notification.requestPermission();
  if (permission === "denied") {
    setPushDeviceState("denied");
    return "denied";
  }
  // Dismissed without choosing: nothing to explain, stay off.
  if (permission !== "granted") return getPushDeviceState();

  let created: PushSubscription | null = null;
  try {
    const registration = await registerServiceWorker();
    const options: PushSubscriptionOptionsInit = {
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(publicKey),
    };
    let subscription = await registration.pushManager.getSubscription();
    // Made under another server key, or the browser can't say which: a
    // stale one is refused on every send, so replace it rather than re-post
    // it (#385). This is a click, so "unknown" is replaced too — one fresh
    // subscription is cheap; a dead one that reads "on" is not.
    if (subscription && compareServerKey(subscription, publicKey) !== "same") {
      subscription = await replaceSubscription(
        registration,
        subscription,
        publicKey,
      );
      created = subscription;
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe(options);
      created = subscription;
    }
    if ((await sendSubscription(subscription)) === "taken") {
      // Another account turned alerts on in this browser. Its row stays
      // theirs; a fresh subscription gives this person their own endpoint
      // (the old one then fails as gone and is cleaned up).
      await subscription.unsubscribe();
      subscription = await registration.pushManager.subscribe(options);
      created = subscription;
      if ((await sendSubscription(subscription)) === "taken") {
        throw new PushActionError(TURN_ON_FAILED);
      }
    }
    const identity = subscriptionIdentity(subscription.toJSON());
    writeLastSent(
      userId,
      identity ? await identityFingerprint(identity) : null,
    );
    setPushDeviceState("on");
    return "on";
  } catch (error) {
    // Don't leave a browser subscription the server never heard of.
    if (created) await created.unsubscribe().catch(() => false);
    if (error instanceof PushActionError) throw error;
    throw new PushActionError(TURN_ON_FAILED);
  }
}

/** Turn alerts off for this device only: the server forgets it, and the
 * browser drops the subscription. Other devices are untouched. */
export async function turnOffPush(userId: string): Promise<PushDeviceState> {
  try {
    const subscription = await currentSubscription();
    if (subscription) {
      const response = await clientApi("/api/push-subscriptions", {
        method: "DELETE",
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      if (!response.ok) {
        const reply = (await response
          .json()
          .catch(() => ({}))) as SubscribeReply;
        throw new PushActionError(reply.error ?? TURN_OFF_FAILED);
      }
      await subscription.unsubscribe().catch(() => false);
    }
    writeLastSent(userId, null);
    setPushDeviceState("off");
    return "off";
  } catch (error) {
    if (error instanceof PushActionError) throw error;
    throw new PushActionError(TURN_OFF_FAILED);
  }
}
