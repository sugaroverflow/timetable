// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PushDeviceState, PushEnvironment } from "@/lib/push";

const mocks = vi.hoisted(() => ({
  /** What detection finds on this pretend device. */
  detected: "off" as PushDeviceState,
  refresh: vi.fn(),
  closeSidebar: vi.fn(),
}));

// The store and the pure detection are real; only the part that talks to
// the browser and the server (refreshPushDevice) is replaced, and it
// publishes `mocks.detected` to the real store as the real one would.
vi.mock("@/lib/push", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/push")>();
  return {
    ...actual,
    refreshPushDevice: (userId: string) => {
      mocks.refresh(userId);
      actual.setPushDeviceState(mocks.detected);
      return Promise.resolve(mocks.detected);
    },
  };
});

vi.mock("@/lib/sidebarStore", () => ({
  closeSidebar: () => mocks.closeSidebar(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { GetNotificationsLink } from "@/components/GetNotificationsLink";
import {
  detectPushSupport,
  resetPushDeviceForTests,
  setPushDeviceState,
} from "@/lib/push";

const KEY = `B${"A".repeat(86)}`;

function link(props: Partial<Parameters<typeof GetNotificationsLink>[0]> = {}) {
  return (
    <GetNotificationsLink
      slug="spt"
      pushPublicKey={KEY}
      viewerId="u1"
      preview={false}
      {...props}
    />
  );
}

const UA = {
  desktop:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  iphone174:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  iphone163:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1",
};

/** A browser that can do push, before any overrides. */
function env(overrides: Partial<PushEnvironment> = {}): PushEnvironment {
  return {
    userAgent: UA.desktop,
    platform: "Linux x86_64",
    maxTouchPoints: 0,
    navigatorStandalone: false,
    displayStandalone: false,
    secureContext: true,
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    permission: "default",
    ...overrides,
  };
}

/** Detection on this device yields `support` ("ready" = push works and no
 * subscription is held, i.e. the store's "off"). */
function deviceIs(environment: PushEnvironment) {
  const support = detectPushSupport(environment);
  mocks.detected = support === "ready" ? "off" : support;
}

afterEach(() => {
  cleanup();
  resetPushDeviceForTests();
  mocks.refresh.mockReset();
  mocks.closeSidebar.mockReset();
  mocks.detected = "off";
});

describe("GetNotificationsLink (plan §3.4)", () => {
  it("renders nothing on the server, before detection", () => {
    deviceIs(env());
    expect(renderToString(link())).toBe("");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("iPhone tab: opens the Add to Home Screen steps", async () => {
    deviceIs(env({ userAgent: UA.iphone174, platform: "iPhone" }));
    expect(mocks.detected).toBe("ios-tab");
    render(link());
    const trigger = await screen.findByRole("button", {
      name: "Get Notifications",
    });
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(trigger);
    expect(
      await screen.findByText(/alerts work only in Topic added to your Home/),
    ).toBeTruthy();
    expect(screen.getByText("Add to Home Screen")).toBeTruthy();
  });

  it("push works, no subscription here: links to the alerts line", async () => {
    deviceIs(env());
    render(link());
    const anchor = await screen.findByRole("link", {
      name: "Get Notifications",
    });
    expect(anchor.getAttribute("href")).toBe("/f/spt/notifications#alerts");
    expect(mocks.refresh).toHaveBeenCalledWith("u1");
    fireEvent.click(anchor);
    expect(mocks.closeSidebar).toHaveBeenCalled();
  });

  it("the installed iPhone app with no subscription links too", async () => {
    deviceIs(
      env({
        userAgent: UA.iphone174,
        platform: "iPhone",
        navigatorStandalone: true,
      }),
    );
    render(link());
    expect(
      (
        await screen.findByRole("link", { name: "Get Notifications" })
      ).getAttribute("href"),
    ).toBe("/f/spt/notifications#alerts");
  });

  it("alerts already on: hidden", async () => {
    mocks.detected = "on";
    const { container } = render(link());
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });

  it("disappears without a reload when alerts are turned on", async () => {
    deviceIs(env());
    render(link());
    await screen.findByRole("link", { name: "Get Notifications" });
    // What turnOnPush does from the alerts line.
    act(() => setPushDeviceState("on"));
    expect(screen.queryByRole("link", { name: "Get Notifications" })).toBe(
      null,
    );
  });

  it.each([
    ["no PushManager", env({ hasPushManager: false })],
    ["no service worker", env({ hasServiceWorker: false })],
    ["iOS before 16.4", env({ userAgent: UA.iphone163, platform: "iPhone" })],
    ["permission denied", env({ permission: "denied" })],
  ])("impossible (%s): hidden", async (_why, environment) => {
    deviceIs(environment);
    expect(["unsupported", "denied"]).toContain(mocks.detected);
    const { container } = render(link());
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });

  it.each([
    ["pushPublicKey null", { pushPublicKey: null }],
    ["a view-as preview", { preview: true }],
    ["no viewer", { viewerId: null }],
  ])("impossible (%s): hidden, and nothing is detected", (_why, props) => {
    deviceIs(env());
    const { container } = render(link(props));
    expect(container.innerHTML).toBe("");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
