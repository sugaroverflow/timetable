import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import type { IcsSlot, ReadableTimetable } from "@timetable/core";
import * as core from "@timetable/core";
import type {
  SlotComment,
  Timeslot,
  Timetable,
  TimetableMembership,
  Topic,
} from "@timetable/db";
import type { Role } from "@timetable/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiApp } from "./app";
import * as clerk from "./auth/clerk";
import * as context from "./context";
import type { ApiContext } from "./context";
import * as email from "./email";

vi.mock("@timetable/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@timetable/core")>();
  return {
    ...actual,
    addSlotComment: vi.fn(),
    computeSlotCounts: vi.fn(),
    countViewerPublishedHearts: vi.fn(),
    createLocalUser: vi.fn(),
    deleteTopic: vi.fn(),
    getAudienceElectorIds: vi.fn(),
    getCommentById: vi.fn(),
    getSlotById: vi.fn(),
    listSlotComments: vi.fn(),
    getTopicById: vi.fn(),
    getMembership: vi.fn(),
    getMembershipById: vi.fn(),
    getPerson: vi.fn(),
    getReadableTimetable: vi.fn(),
    getSlotsForIcs: vi.fn(),
    getTopicQueue: vi.fn(),
    getTimetableById: vi.fn(),
    getUserById: vi.fn(),
    getUserByIcsToken: vi.fn(),
    inviteEmails: vi.fn(),
    listDigestRecipients: vi.fn(),
    listHostTopics: vi.fn(),
    markInviteSent: vi.fn(),
    logActivity: vi.fn(),
    setMemberRoles: vi.fn(),
    setTopicReady: vi.fn(),
    softDeleteComment: vi.fn(),
    toggleHostHeart: vi.fn(),
    updateCommentBody: vi.fn(),
    updateUserEmail: vi.fn(),
    updateTimetableSettings: vi.fn(),
    updateTimetableProfile: vi.fn(),
    updateTimetableSlug: vi.fn(),
  };
});

vi.mock("./auth/clerk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./auth/clerk")>();
  return {
    ...actual,
    getOrCreateClerkUser: vi.fn(),
    createSignInTicket: vi.fn(async () => null),
    replaceClerkEmail: vi.fn(async () => "ok" as const),
  };
});

vi.mock("./email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./email")>();
  return {
    ...actual,
    sendEmail: vi.fn(async () => {}),
  };
});

vi.mock("./context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./context")>();
  return {
    ...actual,
    buildContext: vi.fn(),
  };
});

const originalCronSecret = process.env.CRON_SECRET;
const storageEnvKeys = [
  "SPACES_ENDPOINT",
  "SPACES_REGION",
  "SPACES_BUCKET",
  "SPACES_KEY",
  "SPACES_SECRET",
  "SPACES_PUBLIC_BASE_URL",
  "SPACES_KEY_PREFIX",
  "SPACES_FORCE_PATH_STYLE",
] as const;
const originalStorageEnv = Object.fromEntries(
  storageEnvKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof storageEnvKeys)[number], string | undefined>;

function testContext(userId: string | null, roles: Role[] = []): ApiContext {
  return {
    user: userId
      ? {
          id: userId,
          email: `${userId}@example.com`,
          name: "Test User",
          image: null,
        }
      : null,
    impersonation: null,
    getViewer: vi.fn(async () => ({ userId, roles })),
  };
}

function mockSession(userId: string, roles: Role[]) {
  vi.mocked(context.buildContext).mockResolvedValue(testContext(userId, roles));
}

function restoreCronSecret() {
  if (originalCronSecret === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = originalCronSecret;
  }
}

function restoreStorageEnv() {
  for (const key of storageEnvKeys) {
    const value = originalStorageEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearStorageEnv() {
  for (const key of storageEnvKeys) delete process.env[key];
}

function configureStorageEnv() {
  process.env.SPACES_ENDPOINT = "https://lon1.digitaloceanspaces.com";
  process.env.SPACES_REGION = "lon1";
  process.env.SPACES_BUCKET = "timetable-dev";
  process.env.SPACES_KEY = "test-key";
  process.env.SPACES_SECRET = "test-secret";
  process.env.SPACES_KEY_PREFIX = "test-uploads";
  delete process.env.SPACES_PUBLIC_BASE_URL;
  delete process.env.SPACES_FORCE_PATH_STYLE;
}

function timetableFixture(patch: Partial<Timetable> = {}): Timetable {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "public-calendar",
    name: "Public Calendar",
    privacy: "public",
    customDomain: null,
    settings: {},
    heartsCountFrom: null,
    ownerId: "owner-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...patch,
  };
}

function membershipFixture(
  patch: Partial<TimetableMembership> = {},
): TimetableMembership {
  return {
    id: "membership-1",
    userId: "member-1",
    timetableId: "11111111-1111-1111-1111-111111111111",
    roles: ["host"],
    name: null,
    image: null,
    bio: null,
    slug: null,
    lastSeenFeedAt: null,
    lastSeenNotificationsAt: null,
    inviteSentAt: null,
    queueRoundStartedAt: null,
    digestSettings: {},
    lastDigestAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...patch,
  };
}

function topicFixture(patch: Partial<Topic> = {}): Topic {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    timetableId: "11111111-1111-1111-1111-111111111111",
    hostId: "host-1",
    title: "A topic",
    slug: "a-topic",
    bodyMd: "",
    coverImageUrl: null,
    status: "submitted",
    publishedAt: null,
    readyAt: null,
    contentUpdatedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...patch,
  };
}

function slotFixture(patch: Partial<Timeslot> = {}): Timeslot {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    timetableId: "11111111-1111-1111-1111-111111111111",
    startsAt: new Date("2026-09-01T18:00:00.000Z"),
    endsAt: new Date("2026-09-01T20:00:00.000Z"),
    createdById: null,
    cellKey: null,
    locations: [],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...patch,
  };
}

function slotCommentRowFixture(patch: Partial<SlotComment> = {}): SlotComment {
  return {
    id: "44444444-4444-4444-4444-444444444444",
    slotId: "33333333-3333-3333-3333-333333333333",
    authorId: "elector-1",
    body: "See you there",
    topicId: null,
    greenCount: null,
    yellowCount: null,
    redCount: null,
    editedAt: null,
    hiddenAt: null,
    hiddenByUserId: null,
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    ...patch,
  };
}

function slotCommentViewFixture(patch: Record<string, unknown> = {}) {
  return {
    id: "44444444-4444-4444-4444-444444444444",
    authorId: "elector-1",
    authorName: "Elector One",
    authorImage: null,
    authorRoles: ["elector"],
    body: "See you there",
    topicId: null,
    topicTitle: null,
    counts: null,
    editedAt: null,
    hidden: false,
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    ...patch,
  };
}

async function startTestServer(): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer(createApiApp());

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected HTTP server to listen on a TCP port");
  }

  return {
    baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
    server,
  };
}

async function stopTestServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function withTestServer(run: (baseUrl: string) => Promise<void>) {
  const { baseUrl, server } = await startTestServer();
  try {
    await run(baseUrl);
  } finally {
    await stopTestServer(server);
  }
}

beforeEach(() => {
  vi.mocked(context.buildContext).mockResolvedValue(testContext(null));
});

afterEach(() => {
  restoreCronSecret();
  restoreStorageEnv();
  vi.mocked(context.buildContext).mockReset();
  vi.mocked(core.addSlotComment).mockReset();
  vi.mocked(core.computeSlotCounts).mockReset();
  vi.mocked(core.getAudienceElectorIds).mockReset();
  vi.mocked(core.getSlotById).mockReset();
  vi.mocked(core.listSlotComments).mockReset();
  vi.mocked(core.countViewerPublishedHearts).mockReset();
  vi.mocked(core.createLocalUser).mockReset();
  vi.mocked(core.deleteTopic).mockReset();
  vi.mocked(core.getTopicById).mockReset();
  vi.mocked(core.getMembership).mockReset();
  vi.mocked(core.getMembershipById).mockReset();
  vi.mocked(core.getReadableTimetable).mockReset();
  vi.mocked(core.getSlotsForIcs).mockReset();
  vi.mocked(core.getTopicQueue).mockReset();
  vi.mocked(core.getTimetableById).mockReset();
  vi.mocked(core.getUserById).mockReset();
  vi.mocked(core.getUserByIcsToken).mockReset();
  vi.mocked(core.inviteEmails).mockReset();
  vi.mocked(core.listDigestRecipients).mockReset();
  vi.mocked(core.listHostTopics).mockReset();
  vi.mocked(core.markInviteSent).mockReset();
  vi.mocked(core.getCommentById).mockReset();
  vi.mocked(core.setMemberRoles).mockReset();
  vi.mocked(core.setTopicReady).mockReset();
  vi.mocked(core.softDeleteComment).mockReset();
  vi.mocked(core.toggleHostHeart).mockReset();
  vi.mocked(core.updateCommentBody).mockReset();
  vi.mocked(core.updateUserEmail).mockReset();
  vi.mocked(core.logActivity).mockReset();
  vi.mocked(core.updateTimetableSettings).mockReset();
  vi.mocked(core.updateTimetableProfile).mockReset();
  vi.mocked(core.updateTimetableSlug).mockReset();
  vi.mocked(clerk.getOrCreateClerkUser).mockReset();
  vi.mocked(clerk.createSignInTicket).mockReset();
  vi.mocked(clerk.replaceClerkEmail).mockReset();
  vi.mocked(email.sendEmail).mockClear();
});

describe("createApiApp", () => {
  it("serves the health endpoint", async () => {
    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/health`);

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true });
    });
  });

  it("rejects unauthenticated timetable creation before validation or database work", async () => {
    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/forums`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({
        error: "Not authenticated",
      });
    });
  });

  it("rejects unauthenticated invite management", async () => {
    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/forums/timetable-1/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: ["host@example.com"] }),
      });

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({
        error: "Not authenticated",
      });
    });
  });

  it("rejects unauthenticated membership role edits", async () => {
    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/memberships/membership-1/roles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: ["admin"] }),
      });

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({
        error: "Not authenticated",
      });
    });
  });

  it("rejects invite management for authenticated non-admin members", async () => {
    mockSession("host-1", ["host"]);

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/forums/timetable-1/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: ["new-host@example.com"],
          roles: ["host"],
        }),
      });

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: "Admins only" });
      expect(core.inviteEmails).not.toHaveBeenCalled();
    });
  });

  it("lets authenticated admins invite emails", async () => {
    mockSession("admin-1", ["admin"]);
    const results = [
      { email: "new-host@example.com", status: "invited" },
    ] satisfies Awaited<ReturnType<typeof core.inviteEmails>>;
    vi.mocked(core.inviteEmails).mockResolvedValue(results);

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/forums/timetable-1/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: ["new-host@example.com"],
          roles: ["host"],
        }),
      });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ results });
      expect(core.inviteEmails).toHaveBeenCalledWith(
        "timetable-1",
        "admin-1",
        ["new-host@example.com"],
        ["host"],
      );
    });
  });

  it("rejects add-person from non-admins", async () => {
    mockSession("host-1", ["host"]);

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/forums/timetable-1/people`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "ada@example.com", roles: ["host"] }),
      });

      expect(res.status).toBe(403);
      expect(clerk.getOrCreateClerkUser).not.toHaveBeenCalled();
      expect(core.createLocalUser).not.toHaveBeenCalled();
    });
  });

  it("lets admins pre-create a person without sending any email", async () => {
    mockSession("admin-1", ["admin"]);
    vi.mocked(clerk.getOrCreateClerkUser).mockResolvedValue({
      id: "clerk-9",
      created: true,
    });
    vi.mocked(core.inviteEmails).mockResolvedValue([
      { email: "ada@example.com", status: "added" },
    ]);
    vi.mocked(core.getMembership).mockResolvedValue({
      id: "membership-9",
      inviteSentAt: null,
    });

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/forums/timetable-1/people`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "Ada@Example.com",
          name: "Ada Lovelace",
          roles: ["host"],
        }),
      });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        userId: "clerk-9",
        membershipId: "membership-9",
        accountCreated: true,
        status: "added",
      });
      expect(clerk.getOrCreateClerkUser).toHaveBeenCalledWith(
        "ada@example.com",
        "Ada Lovelace",
      );
      expect(core.createLocalUser).toHaveBeenCalledWith({
        id: "clerk-9",
        email: "ada@example.com",
        name: "Ada Lovelace",
      });
      expect(core.inviteEmails).toHaveBeenCalledWith(
        "timetable-1",
        "admin-1",
        ["ada@example.com"],
        ["host"],
      );
      expect(email.sendEmail).not.toHaveBeenCalled();
    });
  });

  it("lets admins change a never-signed-in member's login email", async () => {
    mockSession("admin-1", ["admin"]);
    vi.mocked(clerk.replaceClerkEmail).mockResolvedValue("ok");
    vi.mocked(core.getMembershipById).mockResolvedValue(
      membershipFixture({ userId: "member-9" }),
    );

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/memberships/membership-1/email`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "Fixed.Typo@Example.com" }),
      });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        email: "fixed.typo@example.com",
      });
      expect(clerk.replaceClerkEmail).toHaveBeenCalledWith(
        "member-9",
        "Fixed.Typo@Example.com",
      );
      expect(core.updateUserEmail).toHaveBeenCalledWith(
        "member-9",
        "Fixed.Typo@Example.com",
      );
      expect(core.logActivity).toHaveBeenCalledWith(
        expect.objectContaining({ action: "member.email_change" }),
      );
    });
  });

  it("refuses the email change once the member has signed in", async () => {
    mockSession("admin-1", ["admin"]);
    vi.mocked(clerk.replaceClerkEmail).mockResolvedValue("signed_in");
    vi.mocked(core.getMembershipById).mockResolvedValue(membershipFixture());

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/memberships/membership-1/email`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "new@example.com" }),
      });

      expect(res.status).toBe(409);
      expect(core.updateUserEmail).not.toHaveBeenCalled();
    });
  });

  it("refuses the email change from non-admins", async () => {
    mockSession("host-1", ["host"]);
    vi.mocked(core.getMembershipById).mockResolvedValue(membershipFixture());

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/memberships/membership-1/email`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "new@example.com" }),
      });

      expect(res.status).toBe(403);
      expect(clerk.replaceClerkEmail).not.toHaveBeenCalled();
    });
  });

  it("rejects invite-send from non-admins", async () => {
    mockSession("host-1", ["host"]);
    vi.mocked(core.getMembershipById).mockResolvedValue(membershipFixture());

    await withTestServer(async (baseUrl) => {
      const res = await fetch(
        `${baseUrl}/api/memberships/membership-1/invite`,
        { method: "POST" },
      );

      expect(res.status).toBe(403);
      expect(email.sendEmail).not.toHaveBeenCalled();
      expect(core.markInviteSent).not.toHaveBeenCalled();
    });
  });

  it("digest-test emails the requesting admin a sample digest", async () => {
    mockSession("admin-1", ["admin"]);
    vi.mocked(core.getReadableTimetable).mockResolvedValue({
      timetable: timetableFixture({ name: "Spring Term", slug: "spring-term" }),
      roles: ["admin"],
    } as ReadableTimetable);

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/forums/spring-term/digest-test`, {
        method: "POST",
      });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        sentTo: "admin-1@example.com",
      });
      const sent = vi.mocked(email.sendEmail).mock.calls.at(-1)?.[0];
      expect(sent?.subject).toMatch(/^\[Test\] Spring Term Topics Digest — /);
      expect(sent?.html).toContain("Spring Term");
    });
  });

  it("refuses digest-test for non-admins", async () => {
    mockSession("host-1", ["host"]);
    vi.mocked(core.getReadableTimetable).mockResolvedValue({
      timetable: timetableFixture({ slug: "spring-term" }),
      roles: ["host"],
    } as ReadableTimetable);

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/forums/spring-term/digest-test`, {
        method: "POST",
      });
      expect(res.status).toBe(403);
      expect(email.sendEmail).not.toHaveBeenCalled();
    });
  });

  it("sends the invite email and records inviteSentAt", async () => {
    mockSession("admin-1", ["admin"]);
    vi.mocked(core.getMembershipById).mockResolvedValue(
      membershipFixture({ userId: "member-9" }),
    );
    vi.mocked(core.getUserById).mockResolvedValue({
      id: "member-9",
      name: "Ada Lovelace",
      email: "ada@example.com",
      image: null,
    });
    vi.mocked(core.getTimetableById).mockResolvedValue(
      timetableFixture({ name: "Spring Term", slug: "spring-term" }),
    );
    vi.mocked(core.listHostTopics).mockResolvedValue([]);

    await withTestServer(async (baseUrl) => {
      const res = await fetch(
        `${baseUrl}/api/memberships/membership-1/invite`,
        { method: "POST" },
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { sentAt: string };
      expect(new Date(body.sentAt).getTime()).not.toBeNaN();
      expect(email.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "ada@example.com",
          subject: expect.stringContaining("Spring Term"),
        }),
      );
      expect(core.markInviteSent).toHaveBeenCalledWith(
        "membership-1",
        expect.any(Date),
      );
    });
  });

  it("embeds the one-click sign-in ticket in the invite email", async () => {
    mockSession("admin-1", ["admin"]);
    vi.mocked(clerk.createSignInTicket).mockResolvedValue("tok_abc123");
    vi.mocked(core.getMembershipById).mockResolvedValue(
      membershipFixture({ userId: "member-9" }),
    );
    vi.mocked(core.getUserById).mockResolvedValue({
      id: "member-9",
      name: "Ada Lovelace",
      email: "ada@example.com",
      image: null,
    });
    vi.mocked(core.getTimetableById).mockResolvedValue(
      timetableFixture({ name: "Spring Term", slug: "spring-term" }),
    );
    vi.mocked(core.listHostTopics).mockResolvedValue([]);

    await withTestServer(async (baseUrl) => {
      const res = await fetch(
        `${baseUrl}/api/memberships/membership-1/invite`,
        { method: "POST" },
      );

      expect(res.status).toBe(200);
      expect(clerk.createSignInTicket).toHaveBeenCalledWith("member-9");
      const sent = vi.mocked(email.sendEmail).mock.calls.at(-1)?.[0];
      expect(sent?.html).toContain("__clerk_ticket=tok_abc123");
      expect(sent?.html).toContain(
        `redirect_url=${encodeURIComponent("/f/spring-term/topics")}`,
      );
      // One click, no OTP — the code-based copy must be gone.
      expect(sent?.html).not.toContain("one-time code");
    });
  });

  it("prevents membership role edits from granting owner to non-owners", async () => {
    mockSession("admin-1", ["admin"]);
    const membership = membershipFixture({ roles: ["host"] });
    vi.mocked(core.getMembershipById).mockResolvedValue(membership);
    vi.mocked(core.getTimetableById).mockResolvedValue(
      timetableFixture({ ownerId: "owner-1" }),
    );
    vi.mocked(core.setMemberRoles).mockResolvedValue({
      ...membership,
      roles: ["admin"],
    });

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/memberships/membership-1/roles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: ["owner", "admin"] }),
      });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        id: "membership-1",
        roles: ["admin"],
      });
      expect(core.setMemberRoles).toHaveBeenCalledWith("membership-1", [
        "admin",
      ]);
    });
  });

  it("preserves owner and admin roles when editing the timetable owner", async () => {
    mockSession("admin-1", ["admin"]);
    const membership = membershipFixture({
      userId: "owner-1",
      roles: ["owner", "admin"],
    });
    vi.mocked(core.getMembershipById).mockResolvedValue(membership);
    vi.mocked(core.getTimetableById).mockResolvedValue(
      timetableFixture({ ownerId: "owner-1" }),
    );
    vi.mocked(core.setMemberRoles).mockResolvedValue({
      ...membership,
      roles: ["host", "owner", "admin"],
    });

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/memberships/membership-1/roles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: ["host"] }),
      });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        id: "membership-1",
        roles: ["host", "owner", "admin"],
      });
      expect(core.setMemberRoles).toHaveBeenCalledWith("membership-1", [
        "host",
        "owner",
        "admin",
      ]);
    });
  });

  it("rejects unauthenticated upload signing", async () => {
    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/uploads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "profile-image",
          filename: "avatar.png",
          contentType: "image/png",
          size: 100,
        }),
      });

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({
        error: "Not authenticated",
      });
    });
  });

  it("returns 503 for upload signing when storage is not configured", async () => {
    mockSession("user-1", []);
    clearStorageEnv();

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/uploads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "profile-image",
          filename: "avatar.png",
          contentType: "image/png",
          size: 100,
        }),
      });

      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toEqual({
        error: "Object storage is not configured",
      });
    });
  });

  it("returns a signed profile image upload", async () => {
    mockSession("user-1", []);
    configureStorageEnv();

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/uploads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "profile-image",
          filename: "avatar.png",
          contentType: "image/png",
          size: 100,
        }),
      });
      const body = (await res.json()) as {
        key: string;
        publicUrl: string;
        uploadUrl: string;
        method: string;
        headers: Record<string, string>;
      };

      expect(res.status).toBe(200);
      expect(body.key).toMatch(
        /^test-uploads\/profile-image\/users\/user-1\/[0-9a-f-]+\.png$/,
      );
      expect(body.publicUrl).toBe(
        `https://timetable-dev.lon1.digitaloceanspaces.com/${body.key}`,
      );
      expect(body.uploadUrl).toContain("X-Amz-Signature=");
      expect(body.method).toBe("PUT");
      expect(body.headers).toEqual({
        "Content-Type": "image/png",
        "x-amz-acl": "public-read",
      });
    });
  });

  it("rejects topic cover uploads from authenticated non-host members", async () => {
    mockSession("elector-1", ["elector"]);
    configureStorageEnv();
    vi.mocked(core.getReadableTimetable).mockResolvedValue({
      timetable: timetableFixture(),
      roles: ["elector"],
    });

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/uploads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "topic-cover",
          timetableIdOrSlug: "public-calendar",
          filename: "cover.webp",
          contentType: "image/webp",
          size: 100,
        }),
      });

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: "Hosts only" });
    });
  });

  it("lets admins sign timetable cover uploads", async () => {
    mockSession("admin-1", ["admin"]);
    configureStorageEnv();
    vi.mocked(core.getReadableTimetable).mockResolvedValue({
      timetable: timetableFixture(),
      roles: ["admin"],
    });

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/uploads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "timetable-cover",
          timetableIdOrSlug: "public-calendar",
          filename: "cover.jpg",
          contentType: "image/jpeg",
          size: 100,
        }),
      });
      const body = (await res.json()) as { key: string; publicUrl: string };

      expect(res.status).toBe(200);
      expect(body.key).toMatch(
        /^test-uploads\/timetable-cover\/timetables\/11111111-1111-1111-1111-111111111111\/admin-1\/[0-9a-f-]+\.jpg$/,
      );
      expect(body.publicUrl).toContain(
        "/test-uploads/timetable-cover/timetables/",
      );
    });
  });

  it("does not run the digest job when the cron secret is unset", async () => {
    delete process.env.CRON_SECRET;

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/jobs/digests`, {
        method: "POST",
      });

      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toEqual({
        error: "Digests not configured (CRON_SECRET unset)",
      });
      expect(core.listDigestRecipients).not.toHaveBeenCalled();
    });
  });

  it("does not run the digest job with the wrong cron secret", async () => {
    process.env.CRON_SECRET = "correct-secret";

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/jobs/digests`, {
        method: "POST",
        headers: { "x-cron-secret": "wrong-secret" },
      });

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
      expect(core.listDigestRecipients).not.toHaveBeenCalled();
    });
  });

  it("returns 404 for unreadable ICS calendars without loading slots", async () => {
    vi.mocked(core.getReadableTimetable).mockResolvedValue(null);

    await withTestServer(async (baseUrl) => {
      const res = await fetch(
        `${baseUrl}/api/forums/private-calendar/calendar.ics`,
      );

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ error: "Not found" });
      expect(core.getReadableTimetable).toHaveBeenCalledWith(
        null,
        "private-calendar",
      );
      expect(core.getSlotsForIcs).not.toHaveBeenCalled();
    });
  });

  it("404s the ICS feed when the forum has not enabled the calendar", async () => {
    const timetable = timetableFixture();
    vi.mocked(core.getReadableTimetable).mockResolvedValue({
      timetable,
      roles: [],
    } satisfies ReadableTimetable);

    await withTestServer(async (baseUrl) => {
      const res = await fetch(
        `${baseUrl}/api/forums/public-calendar/calendar.ics`,
      );
      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({
        error: "Calendar not enabled",
      });
      expect(core.getSlotsForIcs).not.toHaveBeenCalled();
    });
  });

  it("serves readable ICS calendars with calendar headers and slot content", async () => {
    const timetable = timetableFixture({
      settings: { calendar: { enabled: true } },
    });
    const readable = { timetable, roles: [] } satisfies ReadableTimetable;
    const slots: IcsSlot[] = [
      {
        id: "slot-1",
        startsAt: new Date("2026-02-01T10:00:00.000Z"),
        endsAt: new Date("2026-02-01T11:00:00.000Z"),
        location: "Main Hall",
        status: "confirmed",
        url: "https://lu.ma/opening-session",
        topicTitle: "Opening Session",
        sessionHostName: null,
        customTitle: "",
      },
      {
        id: "session-2",
        startsAt: new Date("2026-02-02T10:00:00.000Z"),
        endsAt: new Date("2026-02-02T11:00:00.000Z"),
        location: "",
        status: "proposed",
        url: "",
        topicTitle: null,
        sessionHostName: null,
        customTitle: "Departmental seminar",
      },
    ];

    vi.mocked(core.getReadableTimetable).mockResolvedValue(readable);
    vi.mocked(core.getSlotsForIcs).mockResolvedValue(slots);

    await withTestServer(async (baseUrl) => {
      const res = await fetch(
        `${baseUrl}/api/forums/public-calendar/calendar.ics`,
      );
      const body = await res.text();

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/calendar");
      expect(res.headers.get("content-disposition")).toContain(
        'attachment; filename="public-calendar.ics"',
      );
      expect(body).toContain("BEGIN:VCALENDAR");
      expect(body).toContain("X-WR-CALNAME:Public Calendar");
      expect(body).toContain("SUMMARY:Opening Session");
      // Admin custom sessions carry their own title.
      expect(body).toContain("SUMMARY:Departmental seminar");
      expect(body).toContain("LOCATION:Main Hall");
      expect(body).toContain("STATUS:CONFIRMED");
      expect(body).toContain("URL:https://lu.ma/opening-session");
      expect(core.getSlotsForIcs).toHaveBeenCalledWith(timetable.id);
    });
  });

  it("301-redirects legacy /api/timetables feed URLs, keeping the query", async () => {
    await withTestServer(async (baseUrl) => {
      const res = await fetch(
        `${baseUrl}/api/timetables/public-calendar/calendar.ics?token=abc`,
        { redirect: "manual" },
      );
      expect(res.status).toBe(301);
      expect(res.headers.get("location")).toBe(
        "/api/forums/public-calendar/calendar.ics?token=abc",
      );
    });
  });

  it("exposes the viewer's published-hearted count to signed-in members", async () => {
    const timetable = timetableFixture();
    mockSession("elector-1", ["elector"]);
    vi.mocked(core.getReadableTimetable).mockResolvedValue({
      timetable,
      roles: ["elector"],
    });
    vi.mocked(core.countViewerPublishedHearts).mockResolvedValue(3);

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `query($s: String!) {
            timetable: forum(idOrSlug: $s) { viewerHeartedPublishedCount }
          }`,
          variables: { s: timetable.slug },
        }),
      });

      const body = (await res.json()) as {
        data: { timetable: { viewerHeartedPublishedCount: number | null } };
      };
      expect(res.status).toBe(200);
      expect(body.data.timetable.viewerHeartedPublishedCount).toBe(3);
      expect(core.countViewerPublishedHearts).toHaveBeenCalledWith(
        timetable.id,
        "elector-1",
      );
    });
  });

  it("returns the Topic Queue to electors and null to non-electors", async () => {
    const timetable = timetableFixture();
    vi.mocked(core.getReadableTimetable).mockResolvedValue({
      timetable,
      roles: ["elector"],
    });
    vi.mocked(core.getTopicQueue).mockResolvedValue({
      currentTopicId: null,
      remaining: 0,
      remainingNew: 0,
      roundSize: 4,
      neverSeenCount: 2,
    });

    const query = `query($s: String!) {
      topicQueue(idOrSlug: $s) { remaining remainingNew roundSize neverSeenCount }
    }`;

    await withTestServer(async (baseUrl) => {
      mockSession("elector-1", ["elector"]);
      const asElector = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { s: timetable.slug } }),
      });
      const electorBody = (await asElector.json()) as {
        data: { topicQueue: { roundSize: number } | null };
      };
      expect(electorBody.data.topicQueue).toEqual({
        remaining: 0,
        remainingNew: 0,
        roundSize: 4,
        neverSeenCount: 2,
      });
      expect(core.getTopicQueue).toHaveBeenCalledWith(
        timetable.id,
        "elector-1",
        timetable.heartsCountFrom,
      );

      // Hosts read the queue too (v2 2026-07-29 — they asked for it).
      mockSession("host-1", ["host"]);
      vi.mocked(core.getReadableTimetable).mockResolvedValue({
        timetable,
        roles: ["host"],
      });
      const asHost = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { s: timetable.slug } }),
      });
      const hostBody = (await asHost.json()) as {
        data: { topicQueue: { roundSize: number } | null };
      };
      expect(hostBody.data.topicQueue?.roundSize).toBe(4);

      // Non-members (readable public forum, no roles) get none.
      mockSession("stranger-1", []);
      vi.mocked(core.getReadableTimetable).mockResolvedValue({
        timetable,
        roles: [],
      });
      const asStranger = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { s: timetable.slug } }),
      });
      const strangerBody = (await asStranger.json()) as {
        data: { topicQueue: unknown };
      };
      expect(strangerBody.data.topicQueue).toBeNull();
    });
  });

  it("patches digest defaults through updateTimetableSettings for admins", async () => {
    const timetable = timetableFixture();
    mockSession("admin-1", ["admin"]);
    vi.mocked(core.getReadableTimetable).mockResolvedValue({
      timetable,
      roles: ["admin"],
    });
    vi.mocked(core.updateTimetableSettings).mockResolvedValue(timetable);

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `mutation($s: String!) {
            updateTimetableSettings: updateForumSettings(
              idOrSlug: $s
              digestEnabled: true
            ) { id }
          }`,
          variables: { s: timetable.slug },
        }),
      });

      expect(res.status).toBe(200);
      expect(core.updateTimetableSettings).toHaveBeenCalledWith(timetable.id, {
        digestDefaults: { digestEnabled: true },
      });
    });
  });

  describe("updateForumProfile slug change (editable slugs)", () => {
    const RENAME = `mutation($s: String!, $slug: String) {
      updateForumProfile(idOrSlug: $s, slug: $slug) { id slug }
    }`;

    async function requestRename(baseUrl: string, s: string, slug: string) {
      const res = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: RENAME, variables: { s, slug } }),
      });
      return (await res.json()) as {
        data: { updateForumProfile: { id: string; slug: string } | null };
        errors?: { message: string }[];
      };
    }

    function mockAdminOnForum(timetable: Timetable) {
      mockSession("admin-1", ["admin"]);
      vi.mocked(core.getReadableTimetable).mockResolvedValue({
        timetable,
        roles: ["admin"],
      });
      vi.mocked(core.updateTimetableProfile).mockResolvedValue(timetable);
    }

    it("renames for admins, returns the new slug, logs forum.slug", async () => {
      const timetable = timetableFixture({ slug: "old-name" });
      mockAdminOnForum(timetable);
      vi.mocked(core.updateTimetableSlug).mockResolvedValue({
        ok: true,
        timetable: { ...timetable, slug: "new-name" },
      });

      await withTestServer(async (baseUrl) => {
        const body = await requestRename(baseUrl, "old-name", "new-name");
        expect(body.errors).toBeUndefined();
        expect(body.data.updateForumProfile?.slug).toBe("new-name");
        expect(core.updateTimetableSlug).toHaveBeenCalledWith(
          timetable.id,
          "new-name",
        );
        expect(core.logActivity).toHaveBeenCalledWith(
          expect.objectContaining({
            action: "forum.slug",
            note: "/f/old-name → /f/new-name",
          }),
        );
      });
    });

    it("surfaces a taken slug as a user-readable error", async () => {
      const timetable = timetableFixture({ slug: "old-name" });
      mockAdminOnForum(timetable);
      vi.mocked(core.updateTimetableSlug).mockResolvedValue({
        ok: false,
        reason: "taken",
      });

      await withTestServer(async (baseUrl) => {
        const body = await requestRename(baseUrl, "old-name", "someone-elses");
        expect(body.errors?.[0]?.message).toContain("already taken");
      });
    });

    it("rejects malformed slugs before touching core", async () => {
      const timetable = timetableFixture({ slug: "old-name" });
      mockAdminOnForum(timetable);

      await withTestServer(async (baseUrl) => {
        const body = await requestRename(baseUrl, "old-name", "Bad Slug!");
        expect(body.errors?.length).toBeGreaterThan(0);
        expect(core.updateTimetableSlug).not.toHaveBeenCalled();
      });
    });

    it("treats the unchanged slug as a no-op (no history row)", async () => {
      const timetable = timetableFixture({ slug: "old-name" });
      mockAdminOnForum(timetable);

      await withTestServer(async (baseUrl) => {
        const body = await requestRename(baseUrl, "old-name", "old-name");
        expect(body.errors).toBeUndefined();
        expect(core.updateTimetableSlug).not.toHaveBeenCalled();
      });
    });

    it("refuses non-admins", async () => {
      const timetable = timetableFixture({ slug: "old-name" });
      mockSession("host-1", ["host"]);
      vi.mocked(core.getReadableTimetable).mockResolvedValue({
        timetable,
        roles: ["host"],
      });

      await withTestServer(async (baseUrl) => {
        const body = await requestRename(baseUrl, "old-name", "new-name");
        expect(body.errors?.length).toBeGreaterThan(0);
        expect(core.updateTimetableSlug).not.toHaveBeenCalled();
      });
    });
  });

  describe("deleteTopic", () => {
    const DELETE = `mutation($id: String!){ deleteTopic(topicId: $id) }`;

    async function requestDelete(baseUrl: string, topicId: string) {
      const res = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: DELETE, variables: { id: topicId } }),
      });
      return (await res.json()) as {
        data: { deleteTopic: boolean | null } | null;
        errors?: unknown[];
      };
    }

    it("lets the owning host delete their not-yet-published topic", async () => {
      const topic = topicFixture({ status: "submitted" });
      mockSession("host-1", ["host"]);
      vi.mocked(core.getTopicById).mockResolvedValue(topic);

      await withTestServer(async (baseUrl) => {
        const body = await requestDelete(baseUrl, topic.id);
        expect(body.errors).toBeUndefined();
        expect(body.data?.deleteTopic).toBe(true);
        expect(core.deleteTopic).toHaveBeenCalledWith(topic, "host-1");
      });
    });

    it("refuses for published topics", async () => {
      const topic = topicFixture({
        status: "published",
        publishedAt: new Date("2026-02-01T00:00:00.000Z"),
      });
      mockSession("host-1", ["host"]);
      vi.mocked(core.getTopicById).mockResolvedValue(topic);

      await withTestServer(async (baseUrl) => {
        const body = await requestDelete(baseUrl, topic.id);
        // Error text is masked outside dev — assert presence + no write.
        expect(body.errors?.length).toBeGreaterThan(0);
        expect(core.deleteTopic).not.toHaveBeenCalled();
      });
    });

    it("refuses for anyone but the owning host, admins included", async () => {
      const topic = topicFixture({ status: "submitted", hostId: "host-2" });
      mockSession("admin-1", ["admin"]);
      vi.mocked(core.getTopicById).mockResolvedValue(topic);

      await withTestServer(async (baseUrl) => {
        const body = await requestDelete(baseUrl, topic.id);
        expect(body.errors?.length).toBeGreaterThan(0);
        expect(core.deleteTopic).not.toHaveBeenCalled();
      });
    });
  });

  describe("setTopicReady", () => {
    const SET_READY = `mutation($id: String!, $ready: Boolean!){ setTopicReady(topicId: $id, ready: $ready){ id readyAt } }`;

    async function requestSetReady(
      baseUrl: string,
      topicId: string,
      ready: boolean,
    ) {
      const res = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: SET_READY,
          variables: { id: topicId, ready },
        }),
      });
      return (await res.json()) as {
        data: { setTopicReady: { id: string; readyAt: string | null } | null };
        errors?: unknown[];
      };
    }

    it("lets the owning host mark their pending topic ready", async () => {
      const topic = topicFixture({ status: "submitted" });
      const readyAt = new Date("2026-08-06T12:00:00.000Z");
      mockSession("host-1", ["host"]);
      vi.mocked(core.getTopicById).mockResolvedValue(topic);
      vi.mocked(core.setTopicReady).mockResolvedValue({ ...topic, readyAt });

      await withTestServer(async (baseUrl) => {
        const body = await requestSetReady(baseUrl, topic.id, true);
        expect(body.errors).toBeUndefined();
        expect(body.data?.setTopicReady?.readyAt).toBe(readyAt.toISOString());
        expect(core.setTopicReady).toHaveBeenCalledWith(topic, "host-1", true);
      });
    });

    it("lets an admin move someone else's topic back to drafting", async () => {
      const topic = topicFixture({
        status: "submitted",
        hostId: "host-2",
        readyAt: new Date("2026-08-01T00:00:00.000Z"),
      });
      mockSession("admin-1", ["admin"]);
      vi.mocked(core.getTopicById).mockResolvedValue(topic);
      vi.mocked(core.setTopicReady).mockResolvedValue({
        ...topic,
        readyAt: null,
      });

      await withTestServer(async (baseUrl) => {
        const body = await requestSetReady(baseUrl, topic.id, false);
        expect(body.errors).toBeUndefined();
        expect(body.data?.setTopicReady?.readyAt).toBeNull();
        expect(core.setTopicReady).toHaveBeenCalledWith(
          topic,
          "admin-1",
          false,
        );
      });
    });

    it("refuses for a host who does not own the topic", async () => {
      const topic = topicFixture({ status: "submitted", hostId: "host-2" });
      mockSession("host-1", ["host"]);
      vi.mocked(core.getTopicById).mockResolvedValue(topic);

      await withTestServer(async (baseUrl) => {
        const body = await requestSetReady(baseUrl, topic.id, true);
        expect(body.errors?.length).toBeGreaterThan(0);
        expect(core.setTopicReady).not.toHaveBeenCalled();
      });
    });

    it("refuses on topics that are not pending review", async () => {
      const topic = topicFixture({
        status: "published",
        publishedAt: new Date("2026-02-01T00:00:00.000Z"),
      });
      mockSession("host-1", ["host"]);
      vi.mocked(core.getTopicById).mockResolvedValue(topic);

      await withTestServer(async (baseUrl) => {
        const body = await requestSetReady(baseUrl, topic.id, true);
        expect(body.errors?.length).toBeGreaterThan(0);
        expect(core.setTopicReady).not.toHaveBeenCalled();
      });
    });
  });

  describe("hostHeartTopic (host 💙s)", () => {
    const HOST_HEART = `mutation($id: String!){ hostHeartTopic(topicId: $id) { hearted } }`;

    async function requestHostHeart(baseUrl: string, topicId: string) {
      const res = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: HOST_HEART, variables: { id: topicId } }),
      });
      return (await res.json()) as {
        data: { hostHeartTopic: { hearted: boolean } | null } | null;
        errors?: unknown[];
      };
    }

    it("lets a host who is not an elector 💙 a topic", async () => {
      const topic = topicFixture({ status: "published" });
      mockSession("host-2", ["host"]);
      vi.mocked(core.getTopicById).mockResolvedValue(topic);
      vi.mocked(core.toggleHostHeart).mockResolvedValue({ hearted: true });

      await withTestServer(async (baseUrl) => {
        const body = await requestHostHeart(baseUrl, topic.id);
        expect(body.errors).toBeUndefined();
        expect(body.data?.hostHeartTopic?.hearted).toBe(true);
        expect(core.toggleHostHeart).toHaveBeenCalledWith(topic.id, "host-2");
      });
    });

    it("refuses dual-role members — their ❤️ is their gesture", async () => {
      const topic = topicFixture({ status: "published" });
      mockSession("both-1", ["host", "elector"]);
      vi.mocked(core.getTopicById).mockResolvedValue(topic);

      await withTestServer(async (baseUrl) => {
        const body = await requestHostHeart(baseUrl, topic.id);
        expect(body.errors?.length).toBeGreaterThan(0);
        expect(core.toggleHostHeart).not.toHaveBeenCalled();
      });
    });

    it("refuses electors", async () => {
      const topic = topicFixture({ status: "published" });
      mockSession("elector-1", ["elector"]);
      vi.mocked(core.getTopicById).mockResolvedValue(topic);

      await withTestServer(async (baseUrl) => {
        const body = await requestHostHeart(baseUrl, topic.id);
        expect(body.errors?.length).toBeGreaterThan(0);
        expect(core.toggleHostHeart).not.toHaveBeenCalled();
      });
    });
  });

  describe("slot discussion (open to every member, 2026-08-14)", () => {
    const calendarTimetable = () =>
      timetableFixture({ settings: { calendar: { enabled: true } } });
    const COMMENTS_QUERY = `query($id: String!){ slotComments(slotId: $id) { id body } }`;
    const ADD_COMMENT = `mutation($id: String!, $body: String!, $topic: String){
      addSlotComment(slotId: $id, body: $body, topicId: $topic) { id body topicId }
    }`;

    function mockSlotWorld() {
      const slot = slotFixture();
      vi.mocked(core.getSlotById).mockResolvedValue(slot);
      vi.mocked(core.getTimetableById).mockResolvedValue(calendarTimetable());
      return slot;
    }

    async function gql(baseUrl: string, query: string, variables: unknown) {
      const res = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      return (await res.json()) as {
        data?: Record<string, unknown> | null;
        errors?: { message: string }[];
      };
    }

    it("lets an elector read the thread", async () => {
      const slot = mockSlotWorld();
      mockSession("elector-1", ["elector"]);
      vi.mocked(core.listSlotComments).mockResolvedValue([
        slotCommentViewFixture(),
      ]);

      await withTestServer(async (baseUrl) => {
        const body = await gql(baseUrl, COMMENTS_QUERY, { id: slot.id });
        expect(body.errors).toBeUndefined();
        expect(body.data?.slotComments).toEqual([
          { id: "44444444-4444-4444-4444-444444444444", body: "See you there" },
        ]);
        expect(core.listSlotComments).toHaveBeenCalledWith(slot.id, {
          includeHidden: false,
        });
      });
    });

    it("returns an empty thread to signed-in non-members", async () => {
      const slot = mockSlotWorld();
      mockSession("guest-1", []);

      await withTestServer(async (baseUrl) => {
        const body = await gql(baseUrl, COMMENTS_QUERY, { id: slot.id });
        expect(body.errors).toBeUndefined();
        expect(body.data?.slotComments).toEqual([]);
        expect(core.listSlotComments).not.toHaveBeenCalled();
      });
    });

    it("lets an elector post a plain comment", async () => {
      const slot = mockSlotWorld();
      mockSession("elector-1", ["elector"]);
      vi.mocked(core.addSlotComment).mockResolvedValue(slotCommentRowFixture());
      vi.mocked(core.listSlotComments).mockResolvedValue([
        slotCommentViewFixture(),
      ]);

      await withTestServer(async (baseUrl) => {
        const body = await gql(baseUrl, ADD_COMMENT, {
          id: slot.id,
          body: "See you there",
          topic: null,
        });
        expect(body.errors).toBeUndefined();
        expect(body.data?.addSlotComment).toMatchObject({
          body: "See you there",
          topicId: null,
        });
        expect(core.addSlotComment).toHaveBeenCalledWith(
          slot.id,
          "elector-1",
          "See you there",
          undefined,
        );
      });
    });

    it("refuses an elector's claim attachment (topic snapshots stay host/admin)", async () => {
      const slot = mockSlotWorld();
      mockSession("elector-1", ["elector"]);

      await withTestServer(async (baseUrl) => {
        const body = await gql(baseUrl, ADD_COMMENT, {
          id: slot.id,
          body: "I claim this",
          topic: "22222222-2222-2222-2222-222222222222",
        });
        expect(body.errors?.length).toBeGreaterThan(0);
        expect(core.addSlotComment).not.toHaveBeenCalled();
      });
    });

    it("lets a host post a claim with the availability snapshot", async () => {
      const slot = mockSlotWorld();
      const topic = topicFixture({ status: "published", hostId: "host-1" });
      mockSession("host-1", ["host"]);
      vi.mocked(core.getTopicById).mockResolvedValue(topic);
      vi.mocked(core.getAudienceElectorIds).mockResolvedValue(["elector-1"]);
      vi.mocked(core.computeSlotCounts).mockResolvedValue({
        green: 1,
        yellow: 0,
        red: 0,
      });
      vi.mocked(core.addSlotComment).mockResolvedValue(
        slotCommentRowFixture({ authorId: "host-1", topicId: topic.id }),
      );
      vi.mocked(core.listSlotComments).mockResolvedValue([
        slotCommentViewFixture({
          authorId: "host-1",
          topicId: topic.id,
          topicTitle: topic.title,
          counts: { green: 1, yellow: 0, red: 0 },
        }),
      ]);

      await withTestServer(async (baseUrl) => {
        const body = await gql(baseUrl, ADD_COMMENT, {
          id: slot.id,
          body: "See you there",
          topic: topic.id,
        });
        expect(body.errors).toBeUndefined();
        expect(body.data?.addSlotComment).toMatchObject({ topicId: topic.id });
        expect(core.addSlotComment).toHaveBeenCalledWith(
          slot.id,
          "host-1",
          "See you there",
          { topicId: topic.id, counts: { green: 1, yellow: 0, red: 0 } },
        );
      });
    });

    it("refuses posts when the calendar is disabled", async () => {
      const slot = slotFixture();
      vi.mocked(core.getSlotById).mockResolvedValue(slot);
      vi.mocked(core.getTimetableById).mockResolvedValue(timetableFixture());
      mockSession("elector-1", ["elector"]);

      await withTestServer(async (baseUrl) => {
        const body = await gql(baseUrl, ADD_COMMENT, {
          id: slot.id,
          body: "hello",
          topic: null,
        });
        expect(body.errors?.length).toBeGreaterThan(0);
        expect(core.addSlotComment).not.toHaveBeenCalled();
      });
    });
  });

  it("returns null viewer heart count for anonymous visitors", async () => {
    const timetable = timetableFixture();
    vi.mocked(context.buildContext).mockResolvedValue(testContext(null));
    vi.mocked(core.getReadableTimetable).mockResolvedValue({
      timetable,
      roles: [],
    });

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `query($s: String!) {
            timetable: forum(idOrSlug: $s) { viewerHeartedPublishedCount }
          }`,
          variables: { s: timetable.slug },
        }),
      });

      const body = (await res.json()) as {
        data: { timetable: { viewerHeartedPublishedCount: number | null } };
      };
      expect(res.status).toBe(200);
      expect(body.data.timetable.viewerHeartedPublishedCount).toBeNull();
      expect(core.countViewerPublishedHearts).not.toHaveBeenCalled();
    });
  });

  it("only lets authors edit or delete their own comments", async () => {
    const commentRow = {
      id: "comment-1",
      topicId: "topic-1",
      parentId: null,
      authorId: "author-1",
      body: "original",
      visibility: "public" as const,
      hiddenAt: null,
      hiddenByUserId: null,
      deletedAt: null,
      editedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const gql = (baseUrl: string, query: string) =>
      fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
    const editMutation = `mutation {
      editComment(commentId: "comment-1", body: "changed") { id body editedAt }
    }`;
    const deleteMutation = `mutation { deleteComment(commentId: "comment-1") }`;

    await withTestServer(async (baseUrl) => {
      // Someone else: both refused (errors, no data), nothing written.
      mockSession("intruder-1", ["elector"]);
      vi.mocked(core.getCommentById).mockResolvedValue(commentRow);
      const editDenied = (await (await gql(baseUrl, editMutation)).json()) as {
        errors?: unknown[];
        data?: { editComment: unknown };
      };
      expect(editDenied.errors?.length).toBeGreaterThan(0);
      expect(editDenied.data?.editComment ?? null).toBeNull();
      const delDenied = (await (await gql(baseUrl, deleteMutation)).json()) as {
        errors?: unknown[];
        data?: { deleteComment: unknown };
      };
      expect(delDenied.errors?.length).toBeGreaterThan(0);
      expect(delDenied.data?.deleteComment ?? null).toBeNull();
      expect(core.updateCommentBody).not.toHaveBeenCalled();
      expect(core.softDeleteComment).not.toHaveBeenCalled();

      // The author: edit succeeds and stamps editedAt.
      mockSession("author-1", ["elector"]);
      const editedAt = new Date("2026-07-29T10:00:00.000Z");
      vi.mocked(core.updateCommentBody).mockResolvedValue({
        ...commentRow,
        body: "changed",
        editedAt,
        updatedAt: editedAt,
      });
      const edited = (await (await gql(baseUrl, editMutation)).json()) as {
        data: { editComment: { body: string; editedAt: string | null } };
      };
      expect(edited.data.editComment.body).toBe("changed");
      expect(edited.data.editComment.editedAt).toBe(editedAt.toISOString());
      expect(core.updateCommentBody).toHaveBeenCalledWith(
        "comment-1",
        "changed",
      );

      // The author: delete goes through the soft-delete path.
      vi.mocked(core.softDeleteComment).mockResolvedValue({
        ...commentRow,
        deletedAt: new Date(),
      });
      const deleted = (await (await gql(baseUrl, deleteMutation)).json()) as {
        data: { deleteComment: boolean };
      };
      expect(deleted.data.deleteComment).toBe(true);
      expect(core.softDeleteComment).toHaveBeenCalledWith("comment-1");
    });
  });
});
