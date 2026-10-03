// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clientGql: vi.fn(),
  clientApi: vi.fn(),
  requestPermission: vi.fn(),
  register: vi.fn(),
  getRegistration: vi.fn(),
  getSubscription: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("@/lib/clientGraphql", () => ({
  clientGql: (...args: unknown[]) => mocks.clientGql(...args),
}));

vi.mock("@/lib/clientApi", () => ({
  clientApi: (...args: unknown[]) => mocks.clientApi(...args),
}));

import { AlertsLine } from "@/components/AlertsLine";
import { resetPushDeviceForTests } from "@/lib/push";

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/device-1";
const SUBSCRIPTION_JSON = {
  endpoint: ENDPOINT,
  expirationTime: null,
  keys: { p256dh: `B${"x".repeat(86)}`, auth: "a".repeat(22) },
};
// 65 bytes, base64url — any well-formed key will do; nothing is sent.
const PUBLIC_KEY = `B${"A".repeat(86)}`;

const UA = {
  desktop:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
};

function subscriptionObject() {
  return {
    endpoint: ENDPOINT,
    toJSON: () => SUBSCRIPTION_JSON,
    unsubscribe: mocks.unsubscribe,
  };
}

/** The browser this test pretends to be. */
function setBrowser({
  userAgent = UA.desktop,
  permission = "default" as NotificationPermission,
  push = true,
}: {
  userAgent?: string;
  permission?: NotificationPermission;
  push?: boolean;
} = {}) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value: true,
  });
  window.matchMedia = vi.fn(() => ({ matches: false })) as never;
  const registration = {
    pushManager: {
      getSubscription: mocks.getSubscription,
      subscribe: mocks.subscribe,
    },
  };
  mocks.register.mockResolvedValue(registration);
  mocks.getRegistration.mockResolvedValue(registration);
  if (push) {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        register: mocks.register,
        getRegistration: mocks.getRegistration,
        ready: Promise.resolve(registration),
      },
    });
    vi.stubGlobal("PushManager", function PushManager() {});
    vi.stubGlobal(
      "Notification",
      Object.assign(function Notification() {}, {
        permission,
        requestPermission: mocks.requestPermission,
      }),
    );
  } else {
    // A browser without the APIs (iPhone tabs have none of them).
    Reflect.deleteProperty(navigator, "serviceWorker");
  }
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetPushDeviceForTests();
  window.localStorage.clear();
  mocks.getSubscription.mockResolvedValue(null);
  mocks.subscribe.mockResolvedValue(subscriptionObject());
  mocks.unsubscribe.mockResolvedValue(true);
  mocks.requestPermission.mockResolvedValue("granted");
  mocks.clientGql.mockResolvedValue({ myPushDeviceEnabled: false });
  mocks.clientApi.mockResolvedValue(
    jsonResponse(201, { subscribed: true, created: true }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

function setup() {
  return render(<AlertsLine pushPublicKey={PUBLIC_KEY} viewerId="user-1" />);
}

describe("alerts-line", () => {
  it("renders an empty #alerts anchor until detection runs, so hydration matches", () => {
    setBrowser();
    const { container } = setup();
    const anchor = container.querySelector("#alerts");
    expect(anchor).not.toBeNull();
    expect(anchor!.textContent).toBe("");
  });

  it("unsupported: says so, and asks the browser nothing", async () => {
    setBrowser({ push: false });
    setup();
    await screen.findByText(
      "Alerts on this device: not available in this browser.",
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(mocks.clientGql).not.toHaveBeenCalled();
  });

  it("iPhone tab: shows the Add to Home Screen steps, and no button", async () => {
    setBrowser({ userAgent: UA.iphone, push: false });
    setup();
    await screen.findByText(/alerts work only in Topic added to your Home/);
    expect(screen.getByText("Add to Home Screen")).toBeTruthy();
    expect(screen.getByText("Open Topic from its new icon.")).toBeTruthy();
    expect(
      screen.getByText(
        "Sign in there — the Home Screen app keeps its own sign-in.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("default: offers Turn on without prompting or registering on load", async () => {
    setBrowser();
    setup();
    await screen.findByRole("button", { name: "Turn on" });
    expect(screen.getByText(/Alerts on this device:/)).toBeTruthy();
    expect(mocks.requestPermission).not.toHaveBeenCalled();
    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });
});

describe("alerts-line: turning on", () => {
  it("Turn on: asks permission on the click, subscribes, posts, then offers Turn off", async () => {
    setBrowser();
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Turn on" }));
    await screen.findByText(/Alerts are on for this device/);
    expect(screen.getByRole("button", { name: "Turn off" })).toBeTruthy();
    expect(mocks.requestPermission).toHaveBeenCalledTimes(1);
    expect(mocks.register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    expect(mocks.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    const [path, init] = mocks.clientApi.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/push-subscriptions");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      endpoint: ENDPOINT,
      keys: SUBSCRIPTION_JSON.keys,
      label: "Chrome on Linux",
    });
  });

  it("Turn on refused by the server: shows its reason and drops the new subscription", async () => {
    setBrowser();
    mocks.clientApi.mockResolvedValue(
      jsonResponse(409, {
        error:
          "Alerts are already on for 10 devices — turn them off on one first",
        reason: "cap",
      }),
    );
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Turn on" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toBe(
      "Alerts are already on for 10 devices — turn them off on one first",
    );
    expect(mocks.unsubscribe).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Turn on" })).toBeTruthy();
  });

  it("Turn on in a browser another account holds: re-subscribes for a fresh endpoint", async () => {
    setBrowser();
    mocks.clientApi
      .mockResolvedValueOnce(
        jsonResponse(409, {
          error: "Alerts on this browser belong to another account",
          reason: "taken",
        }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { subscribed: true }));
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Turn on" }));
    await screen.findByText(/Alerts are on for this device/);
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe).toHaveBeenCalledTimes(2);
    expect(mocks.clientApi).toHaveBeenCalledTimes(2);
  });

  it("Turn on, then the browser prompt is blocked: explains denied", async () => {
    setBrowser();
    mocks.requestPermission.mockResolvedValue("denied");
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Turn on" }));
    await screen.findByText(/blocked in your browser or device settings/);
    expect(mocks.subscribe).not.toHaveBeenCalled();
    expect(mocks.clientApi).not.toHaveBeenCalled();
  });
});

describe("alerts-line: denied and on", () => {
  it("denied: explains how to unblock, and never re-prompts", async () => {
    setBrowser({ permission: "denied" });
    setup();
    await screen.findByText(
      "Alerts on this device: blocked in your browser or device settings. To turn them on, allow notifications for Topic there, then reload this page.",
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(mocks.requestPermission).not.toHaveBeenCalled();
  });

  it("on: reads the server's answer for this device, without re-sending", async () => {
    setBrowser({ permission: "granted" });
    mocks.getSubscription.mockResolvedValue(subscriptionObject());
    mocks.clientGql.mockResolvedValue({ myPushDeviceEnabled: true });
    setup();
    await screen.findByRole("button", { name: "Turn off" });
    expect(mocks.clientGql).toHaveBeenCalledWith(
      expect.stringContaining("myPushDeviceEnabled"),
      { endpoint: ENDPOINT },
    );
    expect(mocks.clientApi).not.toHaveBeenCalled();
  });

  it("on, then the browser rotated the subscription: re-sends it once", async () => {
    setBrowser({ permission: "granted" });
    // What this page sent last time, for a different subscription.
    window.localStorage.setItem("topic.push.sent.user-1", "0".repeat(64));
    mocks.getSubscription.mockResolvedValue(subscriptionObject());
    setup();
    await screen.findByRole("button", { name: "Turn off" });
    expect(mocks.clientApi).toHaveBeenCalledTimes(1);
    expect(mocks.clientApi.mock.calls[0]![1].method).toBe("POST");
    const stored = window.localStorage.getItem("topic.push.sent.user-1");
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toBe("0".repeat(64));
  });

  it("Turn off: forgets this device on the server and in the browser", async () => {
    setBrowser({ permission: "granted" });
    mocks.getSubscription.mockResolvedValue(subscriptionObject());
    mocks.clientGql.mockResolvedValue({ myPushDeviceEnabled: true });
    mocks.clientApi.mockResolvedValue(
      jsonResponse(200, { unsubscribed: true }),
    );
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Turn off" }));
    await screen.findByRole("button", { name: "Turn on" });
    const [path, init] = mocks.clientApi.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/push-subscriptions");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body as string)).toEqual({ endpoint: ENDPOINT });
    expect(mocks.unsubscribe).toHaveBeenCalled();
  });

  it("two controls share one store: turning on updates both without a reload", async () => {
    setBrowser();
    render(
      <>
        <AlertsLine pushPublicKey={PUBLIC_KEY} viewerId="user-1" />
        <AlertsLine pushPublicKey={PUBLIC_KEY} viewerId="user-1" />
      </>,
    );
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Turn on" })).toHaveLength(
        2,
      ),
    );
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Turn on" })[0]!);
    });
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Turn off" })).toHaveLength(
        2,
      ),
    );
  });
});
