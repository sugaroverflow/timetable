import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { describe, expect, it, vi } from "vitest";

import { isSafePushUrl } from "@timetable/shared";

/**
 * public/sw.js (Web Push step 4, #368) is plain JavaScript the browser
 * runs as-is, outside every build step, so these tests are its only
 * check: it parses, it shows the payload (or the fixed fallback), and a
 * tap only ever opens a same-origin path.
 */
const SOURCE = readFileSync(
  path.resolve(__dirname, "../../public/sw.js"),
  "utf8",
);
const ORIGIN = "https://topic.example";

type Handler = (event: Record<string, unknown>) => void;

function loadWorker(windows: Record<string, unknown>[] = []) {
  const handlers = new Map<string, Handler>();
  const showNotification = vi.fn(async () => undefined);
  const openWindow = vi.fn(async () => null);
  const self = {
    addEventListener: (type: string, handler: Handler) =>
      handlers.set(type, handler),
    registration: { showNotification },
    clients: {
      matchAll: vi.fn(async () => windows),
      openWindow,
      claim: vi.fn(async () => undefined),
    },
    location: { origin: ORIGIN },
    skipWaiting: vi.fn(),
  };
  vm.runInNewContext(SOURCE, { self, URL });
  return { handlers, showNotification, openWindow, self };
}

/** Dispatch an event and wait for everything it handed to waitUntil. */
async function dispatch(
  worker: ReturnType<typeof loadWorker>,
  type: string,
  event: Record<string, unknown>,
) {
  const pending: Promise<unknown>[] = [];
  worker.handlers.get(type)!({
    ...event,
    waitUntil: (p: Promise<unknown>) => pending.push(p),
  });
  await Promise.all(pending);
}

function pushData(value: unknown) {
  return {
    json: () => (typeof value === "string" ? JSON.parse(value) : value),
  };
}

const FALLBACK_TITLE = "Topic";
const FALLBACK_BODY = "You have new activity";

describe("sw.js", () => {
  it("parses, and listens for exactly install, activate, push and notificationclick", () => {
    expect(() => new vm.Script(SOURCE)).not.toThrow();
    const { handlers } = loadWorker();
    expect([...handlers.keys()].sort()).toEqual([
      "activate",
      "install",
      "notificationclick",
      "push",
    ]);
  });

  it("has no fetch handler and no cache", () => {
    expect(SOURCE).not.toMatch(/addEventListener\(\s*["']fetch/);
    expect(SOURCE).not.toMatch(/caches\./);
  });

  it("shows the payload's title, body and thread tag", async () => {
    const worker = loadWorker();
    await dispatch(worker, "push", {
      data: pushData({
        title: "Joshua Becker in Faculty Lounge",
        body: "but we have infinitely nesting…",
        url: "/f/newspeak-2026/lounge?c=1&reply=2#comment-2",
        tag: "lounge:1",
      }),
    });
    expect(worker.showNotification).toHaveBeenCalledWith(
      "Joshua Becker in Faculty Lounge",
      expect.objectContaining({
        body: "but we have infinitely nesting…",
        tag: "lounge:1",
        renotify: true,
        data: { url: "/f/newspeak-2026/lounge?c=1&reply=2#comment-2" },
      }),
    );
  });

  it.each([
    ["no payload", undefined],
    ["unreadable JSON", { json: () => JSON.parse("{nope") }],
    ["a non-object", pushData("[1]")],
    ["an empty title", pushData({ title: " ", body: "", url: "/", tag: "" })],
    [
      "an off-site url",
      pushData({ title: "x", body: "y", url: "//evil.example/", tag: "t" }),
    ],
    [
      "an absolute url",
      pushData({
        title: "x",
        body: "y",
        url: "https://evil.example/",
        tag: "t",
      }),
    ],
    ["a missing body", pushData({ title: "x", url: "/f/a", tag: "t" })],
  ])("falls back to the fixed alert for %s", async (_name, data) => {
    const worker = loadWorker();
    await dispatch(worker, "push", { data });
    expect(worker.showNotification).toHaveBeenCalledWith(
      FALLBACK_TITLE,
      expect.objectContaining({
        body: FALLBACK_BODY,
        data: { url: "/notifications" },
      }),
    );
  });

  it("opens the alert's path in a new window when no Topic window is open", async () => {
    const worker = loadWorker([
      { url: "https://elsewhere.example/", focus: vi.fn() },
    ]);
    const close = vi.fn();
    await dispatch(worker, "notificationclick", {
      notification: { close, data: { url: "/f/a/my-topics?tab=admin" } },
    });
    expect(close).toHaveBeenCalled();
    expect(worker.openWindow).toHaveBeenCalledWith(
      `${ORIGIN}/f/a/my-topics?tab=admin`,
    );
  });

  it("focuses an open Topic window and navigates it", async () => {
    const navigate = vi.fn(async () => ({}));
    const client = {
      url: `${ORIGIN}/f/a/topics`,
      navigate,
      focus: vi.fn(async () => client),
    };
    const worker = loadWorker([client]);
    await dispatch(worker, "notificationclick", {
      notification: { close: vi.fn(), data: { url: "/f/a/lounge?c=1" } },
    });
    expect(client.focus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(`${ORIGIN}/f/a/lounge?c=1`);
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("opens a new window when the open one can't be navigated", async () => {
    const client = {
      url: `${ORIGIN}/f/a/topics`,
      focus: vi.fn(async () => client),
      navigate: vi.fn(async () => {
        throw new TypeError("not controlled");
      }),
    };
    const worker = loadWorker([client]);
    await dispatch(worker, "notificationclick", {
      notification: { close: vi.fn(), data: { url: "/f/a/topics" } },
    });
    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/f/a/topics`);
  });

  it("never opens an unsafe tap target, whatever the notification carries", async () => {
    const worker = loadWorker();
    await dispatch(worker, "notificationclick", {
      notification: {
        close: vi.fn(),
        data: { url: "https://evil.example/" },
      },
    });
    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/notifications`);
  });

  it("checks urls exactly as the shared isSafePushUrl does", async () => {
    const cases = [
      "/",
      "/f/a/topics?tab=comments#comment-1",
      "//evil.example",
      "/\\evil.example",
      "https://evil.example/",
      "javascript:alert(1)",
      "relative/path",
      "/f/a\nb",
      `/${"a".repeat(1023)}`,
      `/${"a".repeat(1024)}`,
    ];
    for (const url of cases) {
      const worker = loadWorker();
      await dispatch(worker, "push", {
        data: pushData({ title: "t", body: "b", url, tag: "" }),
      });
      const shown = worker.showNotification.mock.calls[0] as unknown as [
        string,
        { data: { url: string } },
      ];
      expect(shown[1].data.url === url, url).toBe(isSafePushUrl(url));
    }
  });
});
