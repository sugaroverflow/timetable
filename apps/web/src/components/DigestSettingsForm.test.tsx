// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MembershipDigestSettings } from "@timetable/shared";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  clientGql: vi.fn(),
  toast: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }),
}));

vi.mock("@/lib/clientGraphql", () => ({
  clientGql: (...args: unknown[]) => mocks.clientGql(...args),
}));

vi.mock("@/components/Toast", () => ({
  useToast: () => ({ toast: mocks.toast, toastError: mocks.toastError }),
}));

import {
  DigestSettingsForm,
  parseViewerPushKinds,
} from "@/components/DigestSettingsForm";

/** What the API's `viewerPushKinds` resolves for an untouched membership:
 * the defaults, `drafts` left out (#379). */
const DEFAULT_PUSH = {
  comments: true,
  replies: true,
  mentions: true,
  lounge: true,
  sessions: true,
  sessionsHostHearted: true,
  availabilityAsks: true,
  commentsHearted: false,
  commentsHostHearted: false,
  hearts: false,
  hostHearts: false,
  newTopics: false,
  newTopicsHost: false,
  pendingReview: false,
  slotReleases: false,
  newMembers: false,
};

const DAILY: MembershipDigestSettings = { enabled: true, frequency: "daily" };
const NEVER: MembershipDigestSettings = { enabled: false };

function renderForm({
  forum = DAILY,
  roles = ["host"],
  pushKinds,
}: {
  forum?: MembershipDigestSettings;
  roles?: string[];
  pushKinds?: Record<string, boolean> | null;
} = {}) {
  return render(
    <DigestSettingsForm
      slug="demo"
      current={{}}
      currentForum={forum}
      forumDefaults={{}}
      roles={roles}
      alerts={<p>alerts slot</p>}
      pushKinds={pushKinds}
    />,
  );
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
}

async function savedCall(): Promise<[string, Record<string, unknown>]> {
  await waitFor(() => expect(mocks.clientGql).toHaveBeenCalledTimes(1));
  return mocks.clientGql.mock.calls[0] as [string, Record<string, unknown>];
}

beforeEach(() => {
  mocks.clientGql.mockResolvedValue({ updateMyForumDigestSettings: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** push-column (Web Push step 5, #368). With no VAPID keys (or in a
 * view-as preview) the page passes no `pushKinds`, and nothing may change
 * for anyone: same list, same Never behaviour, same mutation. */
describe("DigestSettingsForm without push (no keys, or a preview)", () => {
  it("shows the email-only list with labelled switches and no columns", () => {
    renderForm({ pushKinds: null });
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Push")).toBeNull();
    expect(screen.queryByText("Email")).toBeNull();
    expect(screen.getByText("What to include")).toBeTruthy();
    // Each switch is named by its visible label, as before.
    expect(
      screen.getByRole("switch", { name: "Comments on your topics" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("switch", {
        name: "Reminders about your unpublished drafts",
      }),
    ).toBeTruthy();
  });

  it("hides What to include when the cadence is Never, as before", () => {
    renderForm({ forum: NEVER });
    expect(screen.queryByText("What to include")).toBeNull();
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    // The alerts slot (#381) still sits in the card.
    expect(screen.getByText("alerts slot")).toBeTruthy();
  });

  it("saves through the email-only mutation, with no pushKindsJson", async () => {
    renderForm();
    save();
    const [query, variables] = await savedCall();
    expect(query).not.toContain("pushKindsJson");
    expect(Object.keys(variables).sort()).toEqual(["e", "f", "k", "s", "w"]);
    expect(mocks.toast).toHaveBeenCalledWith("Digest settings saved");
  });
});

describe("DigestSettingsForm with the Push column", () => {
  it("shows Email and Push columns with a switch pair per kind", () => {
    renderForm({ pushKinds: DEFAULT_PUSH });
    const table = screen.getByRole("table");
    expect(
      screen.getByRole("columnheader", { name: "Email" }).closest("table"),
    ).toBe(table);
    expect(screen.getByRole("columnheader", { name: "Push" })).toBeTruthy();
    const email = screen.getByRole("switch", {
      name: "Comments on your topics: Email",
    });
    const push = screen.getByRole("switch", {
      name: "Comments on your topics: Push",
    });
    expect(email.getAttribute("aria-checked")).toBe("true");
    expect(push.getAttribute("aria-checked")).toBe("true");
    // Broadcast news is off by default on the Push side.
    expect(
      screen
        .getByRole("switch", { name: "❤️s on your topics: Push" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("gives drafts a dash, not a Push switch", () => {
    renderForm({ pushKinds: DEFAULT_PUSH });
    const label = "Reminders about your unpublished drafts";
    expect(
      screen.getByRole("switch", { name: `${label}: Email` }),
    ).toBeTruthy();
    expect(screen.queryByRole("switch", { name: `${label}: Push` })).toBeNull();
    const row = screen.getByRole("rowheader", { name: label }).closest("tr");
    expect(row?.textContent).toContain("—");
    expect(row?.textContent).toContain("No push alerts");
  });

  it("reads each Push switch from viewerPushKinds", () => {
    renderForm({
      pushKinds: { ...DEFAULT_PUSH, replies: false, hearts: true },
    });
    expect(
      screen
        .getByRole("switch", {
          name: "New comments in threads you're part of: Push",
        })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      screen
        .getByRole("switch", { name: "❤️s on your topics: Push" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("stays shown at Never: Email greys out, Push stays usable", () => {
    renderForm({ forum: NEVER, pushKinds: DEFAULT_PUSH });
    expect(screen.getByRole("table")).toBeTruthy();
    const email = screen.getByRole("switch", {
      name: "Comments on your topics: Email",
    }) as HTMLButtonElement;
    const push = screen.getByRole("switch", {
      name: "Comments on your topics: Push",
    }) as HTMLButtonElement;
    expect(email.disabled).toBe(true);
    expect(push.disabled).toBe(false);
    expect(
      screen
        .getByRole("columnheader", { name: "Email" })
        .classList.contains("kind-table-col-off"),
    ).toBe(true);
    fireEvent.click(push);
    expect(push.getAttribute("aria-checked")).toBe("false");
  });

  it("re-enables the Email column when a cadence is picked", () => {
    renderForm({ forum: NEVER, pushKinds: DEFAULT_PUSH });
    fireEvent.change(screen.getByLabelText("How often"), {
      target: { value: "weekly" },
    });
    const email = screen.getByRole("switch", {
      name: "Comments on your topics: Email",
    }) as HTMLButtonElement;
    expect(email.disabled).toBe(false);
  });

  it("saves both columns in one mutation, every usable Push switch", async () => {
    renderForm({ pushKinds: DEFAULT_PUSH });
    fireEvent.click(
      screen.getByRole("switch", { name: "Comments on your topics: Push" }),
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "❤️s on your topics: Email" }),
    );
    save();
    const [query, variables] = await savedCall();
    expect(query).toContain("pushKindsJson: $p");
    expect(query).toContain("kindsJson: $k");
    const email = JSON.parse(variables.k as string) as Record<string, boolean>;
    const push = JSON.parse(variables.p as string) as Record<string, boolean>;
    expect(email.hearts).toBe(false);
    expect(email.comments).toBe(true);
    expect(push.comments).toBe(false);
    expect(push.replies).toBe(true);
    // drafts is eventless: never sent (the API refuses it, #379).
    expect("drafts" in push).toBe(false);
    expect("drafts" in email).toBe(true);
    expect(variables.e).toBe(true);
    expect(mocks.toast).toHaveBeenCalledWith("Notification settings saved");
  });

  it("saves Push while email is Never, leaving the frequency untouched", async () => {
    renderForm({ forum: NEVER, pushKinds: DEFAULT_PUSH });
    fireEvent.click(
      screen.getByRole("switch", { name: "Comments that @mention you: Push" }),
    );
    save();
    const [, variables] = await savedCall();
    expect(variables.e).toBe(false);
    expect(variables.f).toBeUndefined();
    const push = JSON.parse(variables.p as string) as Record<string, boolean>;
    expect(push.mentions).toBe(false);
  });

  it("sends only the kinds that apply to the viewer, as email does", async () => {
    // An admin sees every row; the ones not theirs are greyed and unsent.
    renderForm({ roles: ["admin"], pushKinds: DEFAULT_PUSH });
    const greyed = screen
      .getAllByRole("switch")
      .filter((s) => (s as HTMLButtonElement).disabled);
    expect(greyed.length).toBeGreaterThan(0);
    save();
    const [, variables] = await savedCall();
    const push = JSON.parse(variables.p as string) as Record<string, boolean>;
    const email = JSON.parse(variables.k as string) as Record<string, boolean>;
    const { drafts: _drafts, ...emailButDrafts } = email;
    void _drafts;
    expect(Object.keys(push).sort()).toEqual(
      Object.keys(emailButDrafts).sort(),
    );
  });
});

describe("parseViewerPushKinds", () => {
  it("reads the API's JSON and treats junk as all-defaults", () => {
    expect(parseViewerPushKinds('{"comments":false}')).toEqual({
      comments: false,
    });
    expect(parseViewerPushKinds("")).toEqual({});
    expect(parseViewerPushKinds(null)).toEqual({});
    expect(parseViewerPushKinds("not json")).toEqual({});
    expect(parseViewerPushKinds("[1]")).toEqual({});
  });
});
