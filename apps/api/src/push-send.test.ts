import { createECDH } from "node:crypto";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("node:https", () => ({ request: mocks.request }));
import { sendPush } from "./push-transport";

beforeEach(() => {
  mocks.request.mockReset();
  const pair = createECDH("prime256v1");
  pair.generateKeys();
  vi.stubEnv("VAPID_PUBLIC_KEY", pair.getPublicKey().toString("base64url"));
  vi.stubEnv("VAPID_PRIVATE_KEY", pair.getPrivateKey().toString("base64url"));
  vi.stubEnv("VAPID_SUBJECT", "mailto:push@example.com");
});
afterEach(() => vi.unstubAllEnvs());

describe("push provider outcomes", () => {
  it.each([
    [201, "sent"],
    [404, "gone"],
    [410, "gone"],
    [429, "retry"],
    [503, "retry"],
    [302, "retry"],
  ])(
    "handles HTTP %s as %s without redirects",
    async (statusCode, expected) => {
      mocks.request.mockImplementation((_url, _options, callback) => {
        const request = Object.assign(new EventEmitter(), {
          end(this: EventEmitter) {
            callback({ statusCode, resume: vi.fn() });
            this.emit("close");
          },
          destroy(this: EventEmitter) {
            this.emit("error", new Error("network failure"));
            this.emit("close");
          },
        });
        return request;
      });
      expect(await sendPush("https://fcm.googleapis.com/send/device")).toBe(
        expected,
      );
      expect(mocks.request).toHaveBeenCalledTimes(1);
      expect(mocks.request.mock.calls[0]?.[1]).toMatchObject({
        method: "POST",
        headers: { "Content-Length": "0", TTL: "300" },
      });
    },
  );
  it("refuses an untrusted endpoint before making any network request", async () => {
    expect(await sendPush("https://127.0.0.1/private")).toBe("retry");
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
