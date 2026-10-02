import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

describe("push service worker", () => {
  it("always displays fixed public copy and ignores payload URLs/content", async () => {
    const handlers: Record<string, (event: unknown) => void> = {};
    const showNotification = vi.fn().mockResolvedValue(undefined);
    const openWindow = vi.fn().mockResolvedValue(undefined);
    runInNewContext(
      readFileSync(new URL("../../web/public/sw.js", import.meta.url), "utf8"),
      {
        URL,
        self: {
          addEventListener: (
            name: string,
            handler: (event: unknown) => void,
          ) => {
            handlers[name] = handler;
          },
          registration: { showNotification },
          clients: { openWindow },
          location: { origin: "https://topic.example" },
        },
      },
    );
    let pending: Promise<unknown> = Promise.resolve();
    const waitUntil = (promise: Promise<unknown>) => {
      pending = promise;
    };
    handlers.push!({
      waitUntil,
      data: { json: () => ({ title: "secret", url: "https://evil.example" }) },
    });
    await pending;
    expect(showNotification).toHaveBeenCalledWith("Topic", {
      body: "You have new activity. Open Topic to see your notifications.",
      tag: "topic-activity",
    });
    handlers.notificationclick!({
      waitUntil,
      notification: { close: vi.fn(), data: { url: "https://evil.example" } },
    });
    await pending;
    expect(openWindow).toHaveBeenCalledWith(
      "https://topic.example/notifications",
    );
    expect(handlers.fetch).toBeUndefined();
  });
});
