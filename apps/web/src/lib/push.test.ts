import { describe, expect, it } from "vitest";

import {
  applicationServerKey,
  compareServerKey,
  detectPushSupport,
  deviceLabel,
  getPushDeviceState,
  identityFingerprint,
  iosSupportsPush,
  iosVersion,
  isIOSDevice,
  resetPushDeviceForTests,
  serverKeyBytes,
  setPushDeviceState,
  shouldResend,
  subscribePushDevice,
  subscriptionIdentity,
  type PushEnvironment,
} from "@/lib/push";

const UA = {
  iphone174:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  iphone163:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1",
  // iPadOS 13+ Safari asks for the desktop site: a Mac user agent.
  macLike:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  macLikeOld:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.2 Safari/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
  firefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
  linuxChrome:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
};

/** A desktop Chrome that can do everything, permission not yet asked. */
function env(over: Partial<PushEnvironment> = {}): PushEnvironment {
  return {
    userAgent: UA.linuxChrome,
    platform: "Linux x86_64",
    maxTouchPoints: 0,
    navigatorStandalone: false,
    displayStandalone: false,
    secureContext: true,
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    permission: "default",
    ...over,
  };
}

describe("isIOSDevice", () => {
  it("knows iPhones by their user agent, whatever the browser", () => {
    expect(isIOSDevice(env({ userAgent: UA.iphone174 }))).toBe(true);
    expect(isIOSDevice(env({ userAgent: UA.iphoneChrome }))).toBe(true);
  });

  it("knows an iPad that reports as a Mac by its touch screen", () => {
    expect(
      isIOSDevice(
        env({ userAgent: UA.macLike, platform: "MacIntel", maxTouchPoints: 5 }),
      ),
    ).toBe(true);
  });

  it("leaves a real Mac, Android and Windows alone", () => {
    expect(
      isIOSDevice(
        env({ userAgent: UA.macLike, platform: "MacIntel", maxTouchPoints: 0 }),
      ),
    ).toBe(false);
    expect(
      isIOSDevice(
        env({ userAgent: UA.android, platform: "Linux", maxTouchPoints: 5 }),
      ),
    ).toBe(false);
    expect(isIOSDevice(env({ userAgent: UA.edge, platform: "Win32" }))).toBe(
      false,
    );
  });
});

describe("iosVersion / iosSupportsPush", () => {
  it("reads iPhone OS and desktop-mode Safari versions", () => {
    expect(iosVersion(UA.iphone174)).toEqual([17, 4]);
    expect(iosVersion(UA.iphone163)).toEqual([16, 3]);
    expect(iosVersion(UA.macLike)).toEqual([17, 4]);
  });

  it("allows 16.4 and later, refuses earlier, and allows the unknown", () => {
    expect(iosSupportsPush(UA.iphone174)).toBe(true);
    expect(iosSupportsPush(UA.iphone174.replace("OS 17_4", "OS 16_4"))).toBe(
      true,
    );
    expect(iosSupportsPush(UA.iphone163)).toBe(false);
    expect(iosSupportsPush(UA.macLikeOld)).toBe(false);
    expect(iosSupportsPush("Mozilla/5.0 (iPhone)")).toBe(true);
  });
});

describe("detectPushSupport", () => {
  it("is ready on a capable desktop browser", () => {
    expect(detectPushSupport(env())).toBe("ready");
    expect(detectPushSupport(env({ permission: "granted" }))).toBe("ready");
  });

  it("explains the Home Screen on an iPhone tab, even without PushManager", () => {
    expect(
      detectPushSupport(
        env({
          userAgent: UA.iphone174,
          hasPushManager: false,
          hasNotification: false,
          permission: null,
        }),
      ),
    ).toBe("ios-tab");
  });

  it("does the same for an iPad that reports as a Mac", () => {
    expect(
      detectPushSupport(
        env({
          userAgent: UA.macLike,
          platform: "MacIntel",
          maxTouchPoints: 5,
          hasPushManager: false,
        }),
      ),
    ).toBe("ios-tab");
  });

  it("is ready in the installed iPhone app", () => {
    expect(
      detectPushSupport(
        env({ userAgent: UA.iphone174, navigatorStandalone: true }),
      ),
    ).toBe("ready");
    expect(
      detectPushSupport(
        env({ userAgent: UA.iphone174, displayStandalone: true }),
      ),
    ).toBe("ready");
  });

  it("is unsupported before iOS 16.4, installed or not", () => {
    expect(detectPushSupport(env({ userAgent: UA.iphone163 }))).toBe(
      "unsupported",
    );
    expect(
      detectPushSupport(
        env({ userAgent: UA.iphone163, navigatorStandalone: true }),
      ),
    ).toBe("unsupported");
  });

  it("is unsupported without any one of the APIs or a secure context", () => {
    for (const missing of [
      "hasServiceWorker",
      "hasPushManager",
      "hasNotification",
      "secureContext",
    ] as const) {
      expect(detectPushSupport(env({ [missing]: false }))).toBe("unsupported");
    }
  });

  it("reports a blocked permission as denied", () => {
    expect(detectPushSupport(env({ permission: "denied" }))).toBe("denied");
  });
});

describe("deviceLabel", () => {
  it("names browser and system, never the raw user agent", () => {
    expect(deviceLabel(env({ userAgent: UA.android }))).toBe(
      "Chrome on Android",
    );
    expect(deviceLabel(env({ userAgent: UA.edge }))).toBe("Edge on Windows");
    expect(deviceLabel(env({ userAgent: UA.firefox }))).toBe(
      "Firefox on Windows",
    );
    expect(deviceLabel(env({ userAgent: UA.iphone174 }))).toBe(
      "Safari on iPhone",
    );
    expect(deviceLabel(env({ userAgent: UA.iphoneChrome }))).toBe(
      "Chrome on iPhone",
    );
    expect(
      deviceLabel(
        env({ userAgent: UA.macLike, platform: "MacIntel", maxTouchPoints: 5 }),
      ),
    ).toBe("Safari on iPad");
    expect(
      deviceLabel(
        env({ userAgent: UA.macLike, platform: "MacIntel", maxTouchPoints: 0 }),
      ),
    ).toBe("Safari on Mac");
    expect(deviceLabel(env({ userAgent: "curl/8" }))).toBeNull();
  });
});

describe("applicationServerKey", () => {
  it("decodes an unpadded base64url key to its bytes", () => {
    // 65 bytes: 0x04 then 64 bytes of 0xfb (exercises - and _).
    const bytes = new Uint8Array(65).fill(0xfb);
    bytes[0] = 4;
    const key = Buffer.from(bytes)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(Array.from(applicationServerKey(key))).toEqual(Array.from(bytes));
  });
});

describe("the server key a subscription was made with (#385)", () => {
  // Two well-formed 65-byte keys, base64url as GraphQL returns them.
  const OURS = Buffer.from(
    new Uint8Array(65).fill(0xfb).fill(4, 0, 1),
  ).toString("base64url");
  const OLD = Buffer.from(new Uint8Array(65).fill(0x11).fill(4, 0, 1)).toString(
    "base64url",
  );
  const withKey = (key: BufferSource | null | undefined) =>
    ({
      options: { applicationServerKey: key, userVisibleOnly: true },
    }) as unknown as PushSubscription;

  it("decodes both forms to the same bytes", () => {
    const fromString = serverKeyBytes(OURS)!;
    const fromBuffer = serverKeyBytes(applicationServerKey(OURS).buffer)!;
    expect(Array.from(fromBuffer)).toEqual(Array.from(fromString));
    expect(fromString).toHaveLength(65);
    expect(serverKeyBytes(null)).toBeNull();
    expect(serverKeyBytes(undefined)).toBeNull();
    expect(serverKeyBytes("not base64url!")).toBeNull();
  });

  it("same key, as the ArrayBuffer the browser keeps: same", () => {
    // The trap: the browser's ArrayBuffer never === the string.
    expect(
      compareServerKey(withKey(applicationServerKey(OURS).buffer), OURS),
    ).toBe("same");
  });

  it("same key, as a typed-array view: same", () => {
    const padded = new Uint8Array(70);
    padded.set(applicationServerKey(OURS), 3);
    expect(compareServerKey(withKey(padded.subarray(3, 68)), OURS)).toBe(
      "same",
    );
  });

  it("a key from another pair: different", () => {
    expect(
      compareServerKey(withKey(applicationServerKey(OLD).buffer), OURS),
    ).toBe("different");
    expect(compareServerKey(withKey(new ArrayBuffer(10)), OURS)).toBe(
      "different",
    );
  });

  it("no key, or no options at all: unknown", () => {
    expect(compareServerKey(withKey(null), OURS)).toBe("unknown");
    expect(compareServerKey({} as PushSubscription, OURS)).toBe("unknown");
  });
});

describe("re-send only on change (#379 call 10)", () => {
  const sub = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    expirationTime: null,
    keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
  };

  it("reads endpoint and keys, or nothing from a partial subscription", () => {
    expect(subscriptionIdentity(sub)).toEqual({
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    });
    expect(subscriptionIdentity({ endpoint: sub.endpoint })).toBeNull();
  });

  it("fingerprints change with the endpoint or either key, and hide them", async () => {
    const id = subscriptionIdentity(sub)!;
    const base = await identityFingerprint(id);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(base).not.toContain("fcm");
    expect(await identityFingerprint({ ...id })).toBe(base);
    for (const changed of [
      { ...id, endpoint: `${id.endpoint}x` },
      { ...id, p256dh: `${id.p256dh.slice(1)}C` },
      { ...id, auth: `${id.auth.slice(1)}b` },
    ]) {
      expect(await identityFingerprint(changed)).not.toBe(base);
    }
  });

  it("re-sends only when this device was on and something changed", () => {
    expect(shouldResend(null, "f1")).toBe(false);
    expect(shouldResend("f1", "f1")).toBe(false);
    expect(shouldResend("f1", "f2")).toBe(true);
  });
});

describe("the device store", () => {
  it("starts unknown and tells subscribers about each real change", () => {
    resetPushDeviceForTests();
    expect(getPushDeviceState()).toBe("unknown");
    const seen: string[] = [];
    const stop = subscribePushDevice(() => seen.push(getPushDeviceState()));
    setPushDeviceState("off");
    setPushDeviceState("off");
    setPushDeviceState("on");
    stop();
    setPushDeviceState("off");
    expect(seen).toEqual(["off", "on"]);
  });
});
