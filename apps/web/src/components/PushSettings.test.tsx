// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  gql: vi.fn(),
  support: vi.fn(),
  permission: vi.fn(),
  subscribe: vi.fn(),
  getSubscription: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock("@/lib/clientApi", () => ({ clientApi: mocks.api }));
vi.mock("@/lib/clientGraphql", () => ({ clientGql: mocks.gql }));
vi.mock("@/lib/push", () => ({
  pushSupport: mocks.support,
  applicationServerKey: () => new Uint8Array(65),
}));
import { PushSettings } from "./PushSettings";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.support.mockReturnValue(null);
  mocks.gql.mockResolvedValue({ pushPublicKey: "key", myPushEnabled: false });
  mocks.api.mockResolvedValue({
    ok: true,
    json: async () => ({ enabled: true }),
  });
  mocks.permission.mockResolvedValue("granted");
  mocks.getSubscription.mockResolvedValue(null);
  mocks.subscribe.mockResolvedValue({
    endpoint: "https://fcm.googleapis.com/send/id",
    unsubscribe: mocks.unsubscribe,
  });
  const registration = {
    pushManager: {
      getSubscription: mocks.getSubscription,
      subscribe: mocks.subscribe,
    },
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: vi.fn().mockResolvedValue(registration),
      ready: Promise.resolve(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    },
  });
  vi.stubGlobal("Notification", {
    permission: "default",
    requestPermission: mocks.permission,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Push settings", () => {
  it("never prompts or subscribes on mount; explicit click enables this forum", async () => {
    render(<PushSettings slug="forum-a" />);
    const button = screen.getByRole("button", {
      name: "Enable push on this device",
    });
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false),
    );
    expect(mocks.permission).not.toHaveBeenCalled();
    expect(mocks.subscribe).not.toHaveBeenCalled();
    fireEvent.click(button);
    await screen.findByRole("button", { name: "Turn off push for this forum" });
    expect(mocks.api).toHaveBeenCalledWith(
      "/api/forums/forum-a/push-subscriptions",
      expect.objectContaining({
        body: JSON.stringify({
          endpoint: "https://fcm.googleapis.com/send/id",
          action: "enable",
        }),
      }),
    );
  });
  it("explains unsupported browsers without requesting permission", async () => {
    mocks.support.mockReturnValue("Install on your Home Screen first.");
    render(<PushSettings slug="forum-a" />);
    await screen.findByText("Install on your Home Screen first.");
    expect(mocks.gql).not.toHaveBeenCalled();
    expect(mocks.permission).not.toHaveBeenCalled();
  });
  it("handles denial without creating a subscription", async () => {
    mocks.permission.mockResolvedValue("denied");
    render(<PushSettings slug="forum-a" />);
    const button = screen.getByRole("button");
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(button);
    await screen.findByText(/Permission was not granted/);
    expect(mocks.subscribe).not.toHaveBeenCalled();
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("rolls back a newly created browser subscription when persistence fails", async () => {
    mocks.api.mockResolvedValue({ ok: false, status: 503 });
    mocks.unsubscribe.mockResolvedValue(true);
    render(<PushSettings slug="forum-a" />);
    const button = screen.getByRole("button");
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(button);
    await waitFor(() => expect(mocks.unsubscribe).toHaveBeenCalled());
    expect(screen.queryByText("Turn off push for this forum")).toBeNull();
  });
  it("disables only this forum and preserves the shared browser subscription", async () => {
    mocks.getSubscription.mockResolvedValue({
      endpoint: "https://fcm.googleapis.com/send/id",
      unsubscribe: mocks.unsubscribe,
    });
    mocks.gql.mockResolvedValue({ pushPublicKey: "key", myPushEnabled: true });
    render(<PushSettings slug="forum-a" />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Turn off push for this forum",
      }),
    );
    await screen.findByText("Push is off for this forum on this device.");
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
    expect(mocks.api).toHaveBeenCalledWith(
      "/api/forums/forum-a/push-subscriptions",
      expect.objectContaining({
        body: JSON.stringify({
          endpoint: "https://fcm.googleapis.com/send/id",
          action: "disable",
        }),
      }),
    );
  });
});
