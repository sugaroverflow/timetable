import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import type { IcsSlot, ReadableTimetable } from "@timetable/core";
import * as core from "@timetable/core";
import type {
  SlotComment,
  SlotSession,
  Timeslot,
  Timetable,
  TimetableMembership,
  Topic,
} from "@timetable/db";
import {
  API_TOKEN_SCOPES,
  type Role,
  type TokenScope,
} from "@timetable/shared";
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
    addSlotSession: vi.fn(),
    buildCalendar: vi.fn(),
    confirmedLocationTaken: vi.fn(),
    slotSubjectTaken: vi.fn(),
    computeSlotCounts: vi.fn(),
    countActiveApiTokens: vi.fn(),
    getSlotSessionById: vi.fn(),
    proposeSlot: vi.fn(),
    updateSlotSessionRow: vi.fn(),
    buildFeed: vi.fn(),
    countTopicSessionSlots: vi.fn(),
    countViewerPublishedHearts: vi.fn(),
    createApiToken: vi.fn(),
    createLocalUser: vi.fn(),
    deleteTopic: vi.fn(),
    getAudienceElectorIds: vi.fn(),
    getCommentById: vi.fn(),
    getSlotById: vi.fn(),
    listCommentTreesForTopics: vi.fn(),
    listSlotComments: vi.fn(),
    listTopicSessionSlotIds: vi.fn(),
    getTopicById: vi.fn(),
    getWeightedBreakdown: vi.fn(),
    // Default: no roles — commentNode's author-pill lookup must not reach
    // the real DB. Tests that care set their own resolved value.
    getViewerRoles: vi.fn(async () => []),
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
    setCommentPinned: vi.fn(),
    setMemberRoles: vi.fn(),
    setTopicReady: vi.fn(),
    softDeleteComment: vi.fn(),
    toggleHeart: vi.fn(),
    toggleHostHeart: vi.fn(),
    updateCommentBody: vi.fn(),
    updateUserEmail: vi.fn(),
    updateTimetableSettings: vi.fn(),
    updateTimetableProfile: vi.fn(),
    updateTimetableSlug: vi.fn(),
  };
});

// /health pings the database now (ops R3). The suite runs with no Postgres,
// so stub the one query it makes; the real timeout/failure behaviour is
// covered by the injectable seam in http/health.test.ts.
vi.mock("@timetable/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@timetable/db")>();
  return {
    ...actual,
    db: { execute: vi.fn(async () => []) },
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

/** The real buildContext, for the tests that must exercise its own auth
 * decisions rather than a stand-in (see "REST refuses personal tokens").
 * Captured from the mock factory's importOriginal rather than a top-level
 * vi.importActual: that would instantiate a SECOND copy of the module graph,
 * and Yoga would stop recognising GraphQLErrors thrown by the other copy's
 * `graphql` — masking every resolver error as "Unexpected error." */
const real = vi.hoisted(() => ({
  buildContext: undefined as
    | undefined
    | typeof import("./context").buildContext,
}));

vi.mock("./context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./context")>();
  real.buildContext = actual.buildContext;
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

function testContext(
  userId: string | null,
  roles: Role[] = [],
  apiToken: ApiContext["apiToken"] = null,
): ApiContext {
  return {
    user: userId
      ? {
          id: userId,
          email: `${userId}@example.com`,
          name: "Test User",
          image: null,
        }
      : null,
    apiToken,
    impersonation: null,
    getViewer: vi.fn(async () => ({ userId, roles })),
  };
}

function mockSession(userId: string, roles: Role[]) {
  vi.mocked(context.buildContext).mockResolvedValue(testContext(userId, roles));
}

/** A request authenticated by a personal API token holding `scopes`. */
function mockTokenAuth(userId: string, roles: Role[], scopes: TokenScope[]) {
  vi.mocked(context.buildContext).mockResolvedValue(
    testContext(userId, roles, { id: "token-1", scopes }),
  );
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

function slotSessionFixture(patch: Partial<SlotSession> = {}): SlotSession {
  return {
    id: "55555555-5555-5555-5555-555555555555",
    slotId: "33333333-3333-3333-3333-333333333333",
    location: "",
    topicId: "22222222-2222-2222-2222-222222222222",
    sessionHostId: "host-1",
    customTitle: "",
    status: "proposed",
    url: "",
    createdById: "host-1",
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
  vi.mocked(core.addSlotSession).mockReset();
  vi.mocked(core.buildCalendar).mockReset();
  vi.mocked(core.confirmedLocationTaken).mockReset();
  vi.mocked(core.slotSubjectTaken).mockReset();
  vi.mocked(core.computeSlotCounts).mockReset();
  vi.mocked(core.getSlotSessionById).mockReset();
  vi.mocked(core.proposeSlot).mockReset();
  vi.mocked(core.updateSlotSessionRow).mockReset();
  vi.mocked(core.buildFeed).mockReset();
  vi.mocked(core.countTopicSessionSlots).mockReset();
  vi.mocked(core.getAudienceElectorIds).mockReset();
  vi.mocked(core.getSlotById).mockReset();
  vi.mocked(core.listCommentTreesForTopics).mockReset();
  vi.mocked(core.listSlotComments).mockReset();
  vi.mocked(core.listTopicSessionSlotIds).mockReset();
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
  vi.mocked(core.countActiveApiTokens).mockReset();
  vi.mocked(core.createApiToken).mockReset();
  vi.mocked(core.setMemberRoles).mockReset();
  vi.mocked(core.setTopicReady).mockReset();
  vi.mocked(core.softDeleteComment).mockReset();
  vi.mocked(core.toggleHeart).mockReset();
  vi.mocked(core.toggleHostHeart).mockReset();
  vi.mocked(core.updateCommentBody).mockReset();
  vi.mocked(core.updateUserEmail).mockReset();
  vi.mocked(core.logActivity).mockReset();
  vi.mocked(core.getWeightedBreakdown).mockReset();
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
      await expect(res.json()).resolves.toEqual({ ok: true, db: "up" });
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

  it("refuses pointing a member's email at a sysadmin address", async () => {
    // users.email is what isSysadmin() derives operator status from, so an
    // admin-writable path re-pointing it at SYSADMIN_EMAILS would be a
    // forum-admin → sysadmin escalation (audit 2026-08-17). The dev default
    // sysadmin address is admin-edwin+clerk_test@example.com (env.ts).
    mockSession("admin-1", ["admin"]);
    vi.mocked(core.getMembershipById).mockResolvedValue(
      membershipFixture({ userId: "member-9" }),
    );

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/memberships/membership-1/email`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "Admin-Edwin+clerk_test@example.com" }),
      });

      expect(res.status).toBe(403);
      expect(clerk.replaceClerkEmail).not.toHaveBeenCalled();
      expect(core.updateUserEmail).not.toHaveBeenCalled();
    });
  });

  it("refuses pre-creating an account at a sysadmin address", async () => {
    mockSession("admin-1", ["admin"]);

    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/forums/timetable-1/people`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin-edwin+clerk_test@example.com",
          roles: ["host"],
        }),
      });

      expect(res.status).toBe(403);
      expect(core.createLocalUser).not.toHaveBeenCalled();
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

  describe("calendar counts (host/admin only, 2026-08-16)", () => {
    const QUERY = `query($s: String!){
      calendar(idOrSlug: $s) { id counts { green } perUser { userId } }
    }`;

    async function request(baseUrl: string) {
      const res = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: QUERY, variables: { s: "public" } }),
      });
      return (await res.json()) as {
        data?: {
          calendar: {
            id: string;
            counts: { green: number } | null;
            perUser: unknown[] | null;
          }[];
        };
        errors?: unknown[];
      };
    }

    function mockCalendarWorld(roles: string[]) {
      vi.mocked(core.getReadableTimetable).mockResolvedValue({
        timetable: timetableFixture({
          settings: { calendar: { enabled: true } },
        }),
        roles: roles as never,
      });
      vi.mocked(core.getAudienceElectorIds).mockResolvedValue(["elector-1"]);
      vi.mocked(core.buildCalendar).mockResolvedValue([
        {
          id: "33333333-3333-3333-3333-333333333333",
          startsAt: new Date("2026-09-01T18:00:00.000Z"),
          endsAt: new Date("2026-09-01T20:00:00.000Z"),
          cellKey: null,
          createdById: null,
          locations: [],
          sessions: [],
          viewerState: null,
          counts: { green: 3, yellow: 1, red: 0 },
          perUser: [
            { userId: "elector-1", name: null, image: null, state: "green" },
          ],
          commentCount: 0,
        },
      ]);
    }

    it("serves the wash to a host", async () => {
      mockSession("host-1", ["host"]);
      mockCalendarWorld(["host"]);

      await withTestServer(async (baseUrl) => {
        const body = await request(baseUrl);
        expect(body.data?.calendar[0]?.counts).toEqual({ green: 3 });
        expect(body.data?.calendar[0]?.perUser).toHaveLength(1);
      });
    });

    it("gives an elector neither counts nor names", async () => {
      mockSession("elector-1", ["elector"]);
      mockCalendarWorld(["elector"]);

      await withTestServer(async (baseUrl) => {
        const body = await request(baseUrl);
        // The row is still there — an elector reads the schedule and sets
        // their own availability; they just can't total everyone else's.
        expect(body.data?.calendar).toHaveLength(1);
        expect(body.data?.calendar[0]?.counts).toBeNull();
        expect(body.data?.calendar[0]?.perUser).toBeNull();
      });
    });
  });

  describe("topicWeightedBreakdown (member-or-public since audit 2026-08-17)", () => {
    const QUERY = `query($s: String!, $t: String!){
      topicWeightedBreakdown(idOrSlug: $s, topicId: $t) { electorId }
    }`;

    const breakdownRow = {
      electorId: "elector-1",
      electorName: "Elector One",
      electorImage: null,
      weight: 1,
      heartedAt: new Date("2026-06-01T00:00:00.000Z"),
    };

    async function request(baseUrl: string) {
      const res = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: QUERY,
          variables: { s: "public-calendar", t: "topic-1" },
        }),
      });
      return (await res.json()) as {
        data?: { topicWeightedBreakdown: { electorId: string }[] | null };
      };
    }

    function mockForum(privacy: "public" | "hosts_only", roles: string[]) {
      vi.mocked(core.getReadableTimetable).mockResolvedValue({
        timetable: timetableFixture({ privacy }),
        roles: roles as never,
      });
      vi.mocked(core.getWeightedBreakdown).mockResolvedValue([
        breakdownRow as never,
      ]);
    }

    it("serves a member of a hosts_only forum", async () => {
      mockSession("elector-1", ["elector"]);
      mockForum("hosts_only", ["elector"]);

      await withTestServer(async (baseUrl) => {
        const body = await request(baseUrl);
        expect(body.data?.topicWeightedBreakdown).toEqual([
          { electorId: "elector-1" },
        ]);
      });
    });

    it("refuses a signed-in non-member on a hosts_only forum", async () => {
      // hosts_only deliberately hides the elector membership from the
      // public; the breakdown is exactly that list, so sign-in alone is
      // not enough.
      mockSession("stranger-1", []);
      mockForum("hosts_only", []);

      await withTestServer(async (baseUrl) => {
        const body = await request(baseUrl);
        expect(body.data?.topicWeightedBreakdown).toBeNull();
        expect(core.getWeightedBreakdown).not.toHaveBeenCalled();
      });
    });

    it("still serves a signed-in non-member on a public forum", async () => {
      mockSession("stranger-1", []);
      mockForum("public", []);

      await withTestServer(async (baseUrl) => {
        const body = await request(baseUrl);
        expect(body.data?.topicWeightedBreakdown).toEqual([
          { electorId: "elector-1" },
        ]);
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

    it("shows claim snapshots to everyone in the thread", async () => {
      const CLAIM_QUERY = `query($id: String!){
        slotComments(slotId: $id) { id topicTitle counts { green yellow red } }
      }`;
      const slot = mockSlotWorld();
      vi.mocked(core.listSlotComments).mockResolvedValue([
        slotCommentViewFixture({
          topicId: "topic-1",
          topicTitle: "Quantum ethics",
          counts: { green: 5, yellow: 2, red: 1 },
        }),
      ]);
      const claim = [
        {
          id: "44444444-4444-4444-4444-444444444444",
          topicTitle: "Quantum ethics",
          counts: { green: 5, yellow: 2, red: 1 },
        },
      ];

      await withTestServer(async (baseUrl) => {
        // The LIVE wash is host/admin-only (2026-08-16), but a frozen
        // snapshot is different in kind (Ed): no avatars, and it's the
        // argument its author chose to publish into a booking discussion.
        mockSession("elector-1", ["elector"]);
        const elector = await gql(baseUrl, CLAIM_QUERY, { id: slot.id });
        expect(elector.data?.slotComments).toEqual(claim);

        mockSession("host-1", ["host"]);
        const host = await gql(baseUrl, CLAIM_QUERY, { id: slot.id });
        expect(host.data?.slotComments).toEqual(claim);
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

  describe("topicSlotFit (topic-workbench, 2026-08-14)", () => {
    // Calendar rows since 2026-08-16 (decision 10a): the workbench renders
    // the calendar's own component, so it asks for the calendar's own shape.
    const QUERY = `query($s: String!, $t: String!){
      topicSlotFit(idOrSlug: $s, topicId: $t) {
        hearterCount
        slots {
          id commentCount
          sessions { id status topic { id } }
          counts { green }
          perUser { userId state }
        }
      }
    }`;

    const calendarTimetable = () =>
      timetableFixture({ settings: { calendar: { enabled: true } } });

    function calendarSlot(
      patch: Partial<core.CalendarSlot> = {},
    ): core.CalendarSlot {
      return {
        id: "33333333-3333-3333-3333-333333333333",
        startsAt: new Date("2026-09-01T18:00:00.000Z"),
        endsAt: new Date("2026-09-01T20:00:00.000Z"),
        cellKey: null,
        createdById: null,
        locations: [],
        sessions: [],
        viewerState: null,
        counts: { green: 0, yellow: 0, red: 0 },
        perUser: [],
        commentCount: 0,
        ...patch,
      };
    }

    function session(
      patch: Partial<core.CalendarSession> = {},
    ): core.CalendarSession {
      return {
        id: "55555555-5555-5555-5555-555555555555",
        location: "",
        status: "proposed",
        url: "",
        customTitle: "",
        topic: null,
        sessionHost: null,
        ...patch,
      };
    }

    async function request(baseUrl: string, topicId: string) {
      const res = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: QUERY,
          variables: { s: "public-calendar", t: topicId },
        }),
      });
      return (await res.json()) as {
        data?: {
          topicSlotFit: {
            hearterCount: number;
            slots: {
              id: string;
              commentCount: number;
              sessions: {
                id: string;
                status: string;
                topic: { id: string } | null;
              }[];
              counts: { green: number } | null;
              perUser: { userId: string; state: string }[] | null;
            }[];
          } | null;
        };
        errors?: unknown[];
      };
    }

    it("serves whole calendar rows, scored against this topic's hearters", async () => {
      const topic = topicFixture({ status: "published", hostId: "host-1" });
      mockSession("host-1", ["host"]);
      vi.mocked(core.getReadableTimetable).mockResolvedValue({
        timetable: calendarTimetable(),
        roles: ["host"],
      });
      vi.mocked(core.getTopicById).mockResolvedValue(topic);
      vi.mocked(core.getAudienceElectorIds).mockResolvedValue([
        "elector-1",
        "elector-2",
      ]);
      vi.mocked(core.buildCalendar).mockResolvedValue([
        // This topic pencilled, alongside someone else's pencil (pencils
        // are location-less time-intents — both share the slot).
        calendarSlot({
          id: "aaaaaaaa-0000-0000-0000-000000000001",
          sessions: [
            session({
              id: "55555555-5555-5555-5555-555555555551",
              status: "confirmed",
              topic: {
                id: topic.id,
                title: topic.title,
                topicSlug: null,
                hostId: "host-1",
                hostName: null,
              },
            }),
            session({
              id: "55555555-5555-5555-5555-555555555552",
              topic: {
                id: "topic-2",
                title: "Quantum ethics",
                topicSlug: null,
                hostId: "host-2",
                hostName: "Ann",
              },
            }),
          ],
          counts: { green: 2, yellow: 0, red: 0 },
          perUser: [
            { userId: "elector-1", name: null, image: null, state: "green" },
            { userId: "elector-2", name: null, image: null, state: "green" },
          ],
        }),
        // A slot with only someone else's session — no own pencil.
        calendarSlot({
          id: "aaaaaaaa-0000-0000-0000-000000000002",
          sessions: [
            session({ sessionHost: { id: "host-3", name: "Hannah" } }),
          ],
        }),
      ]);

      await withTestServer(async (baseUrl) => {
        const body = await request(baseUrl, topic.id);
        expect(body.errors).toBeUndefined();
        expect(body.data?.topicSlotFit?.hearterCount).toBe(2);
        expect(body.data?.topicSlotFit?.slots).toEqual([
          {
            id: "aaaaaaaa-0000-0000-0000-000000000001",
            commentCount: 0,
            // Every booking on the slot, this topic's own included — the
            // row renders them as session lines, exactly as the calendar
            // page does (2026-08-16).
            sessions: [
              {
                id: "55555555-5555-5555-5555-555555555551",
                status: "confirmed",
                topic: { id: topic.id },
              },
              {
                id: "55555555-5555-5555-5555-555555555552",
                status: "proposed",
                topic: { id: "topic-2" },
              },
            ],
            // The wash is this topic's hearters, not the whole forum's —
            // the workbench's one genuinely local thing.
            counts: { green: 2 },
            perUser: [
              { userId: "elector-1", state: "green" },
              { userId: "elector-2", state: "green" },
            ],
          },
          {
            id: "aaaaaaaa-0000-0000-0000-000000000002",
            commentCount: 0,
            sessions: [
              {
                id: "55555555-5555-5555-5555-555555555555",
                status: "proposed",
                topic: null,
              },
            ],
            counts: { green: 0 },
            perUser: [],
          },
        ]);
        expect(core.getAudienceElectorIds).toHaveBeenCalledWith(
          "11111111-1111-1111-1111-111111111111",
          { kind: "hearted_topic", topicId: topic.id },
        );
      });
    });

    it("serves admins for any topic, but other hosts get null", async () => {
      const topic = topicFixture({ status: "published", hostId: "host-1" });
      vi.mocked(core.getTopicById).mockResolvedValue(topic);
      vi.mocked(core.getAudienceElectorIds).mockResolvedValue([]);
      vi.mocked(core.buildCalendar).mockResolvedValue([]);

      await withTestServer(async (baseUrl) => {
        mockSession("admin-1", ["admin"]);
        vi.mocked(core.getReadableTimetable).mockResolvedValue({
          timetable: calendarTimetable(),
          roles: ["admin"],
        });
        const adminBody = await request(baseUrl, topic.id);
        expect(adminBody.data?.topicSlotFit?.hearterCount).toBe(0);

        mockSession("host-2", ["host"]);
        vi.mocked(core.getReadableTimetable).mockResolvedValue({
          timetable: calendarTimetable(),
          roles: ["host"],
        });
        const otherHost = await request(baseUrl, topic.id);
        expect(otherHost.data?.topicSlotFit).toBeNull();
      });
    });

    it("returns null for non-members, anonymous, disabled calendar, foreign topic", async () => {
      const topic = topicFixture({ status: "published", hostId: "host-1" });

      await withTestServer(async (baseUrl) => {
        // Anonymous.
        vi.mocked(context.buildContext).mockResolvedValue(testContext(null));
        expect(
          (await request(baseUrl, topic.id)).data?.topicSlotFit,
        ).toBeNull();

        // Calendar disabled.
        mockSession("host-1", ["host"]);
        vi.mocked(core.getReadableTimetable).mockResolvedValue({
          timetable: timetableFixture(),
          roles: ["host"],
        });
        vi.mocked(core.getTopicById).mockResolvedValue(topic);
        expect(
          (await request(baseUrl, topic.id)).data?.topicSlotFit,
        ).toBeNull();

        // Foreign topic (another forum's id).
        vi.mocked(core.getReadableTimetable).mockResolvedValue({
          timetable: calendarTimetable(),
          roles: ["host"],
        });
        vi.mocked(core.getTopicById).mockResolvedValue(
          topicFixture({ timetableId: "99999999-9999-9999-9999-999999999999" }),
        );
        expect(
          (await request(baseUrl, topic.id)).data?.topicSlotFit,
        ).toBeNull();
        expect(core.buildCalendar).not.toHaveBeenCalled();
      });
    });
  });

  describe("topicSessions (sessions-tab; calendar rows since 2026-08-16)", () => {
    const QUERY = `query($s: String!, $t: String!){
      topicSessions(idOrSlug: $s, topicId: $t) {
        id viewerState commentCount
        counts { green }
        perUser { userId }
        sessions { id status location }
      }
    }`;

    const calendarTimetable = () =>
      timetableFixture({ settings: { calendar: { enabled: true } } });

    function slotRow(
      patch: Partial<core.CalendarSlot> = {},
    ): core.CalendarSlot {
      return {
        id: "33333333-3333-3333-3333-333333333333",
        startsAt: new Date("2026-09-01T18:00:00.000Z"),
        endsAt: new Date("2026-09-01T20:00:00.000Z"),
        cellKey: null,
        createdById: null,
        locations: [],
        sessions: [
          {
            id: "55555555-5555-5555-5555-555555555555",
            location: "",
            status: "proposed",
            url: "",
            customTitle: "",
            topic: null,
            sessionHost: null,
          },
        ],
        viewerState: null,
        counts: { green: 4, yellow: 1, red: 0 },
        perUser: [
          { userId: "elector-9", name: null, image: null, state: "green" },
        ],
        commentCount: 2,
        ...patch,
      };
    }

    async function request(baseUrl: string, topicId: string) {
      const res = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: QUERY,
          variables: { s: "public-calendar", t: topicId },
        }),
      });
      return (await res.json()) as {
        data?: {
          topicSessions:
            | {
                id: string;
                viewerState: string | null;
                commentCount: number;
                counts: { green: number } | null;
                perUser: { userId: string }[] | null;
                sessions: { id: string; status: string; location: string }[];
              }[]
            | null;
        };
        errors?: unknown[];
      };
    }

    it("builds only the topic's own slots, and hides the wash from an elector", async () => {
      const topic = topicFixture({ status: "published" });
      mockSession("elector-1", ["elector"]);
      vi.mocked(core.getReadableTimetable).mockResolvedValue({
        timetable: calendarTimetable(),
        roles: ["elector"],
      });
      vi.mocked(core.getTopicById).mockResolvedValue(topic);
      vi.mocked(core.listTopicSessionSlotIds).mockResolvedValue([
        "33333333-3333-3333-3333-333333333333",
      ]);
      vi.mocked(core.buildCalendar).mockResolvedValue([
        slotRow({ viewerState: "green" }),
      ]);

      await withTestServer(async (baseUrl) => {
        const body = await request(baseUrl, topic.id);
        expect(body.errors).toBeUndefined();
        expect(body.data?.topicSessions).toEqual([
          {
            id: "33333333-3333-3333-3333-333333333333",
            viewerState: "green",
            commentCount: 2,
            // Group availability is host/admin-only (2026-08-16); the
            // elector keeps their own answer and the session facts.
            counts: null,
            perUser: null,
            sessions: [
              {
                id: "55555555-5555-5555-5555-555555555555",
                status: "proposed",
                location: "",
              },
            ],
          },
        ]);
        // The tab builds THIS topic's slots, never the forum's whole
        // schedule — and skips the audience query it wouldn't show.
        expect(core.buildCalendar).toHaveBeenCalledWith(
          "11111111-1111-1111-1111-111111111111",
          [],
          "elector-1",
          { slotIds: ["33333333-3333-3333-3333-333333333333"] },
        );
      });
    });

    it("serves anonymous viewers of a readable forum, viewerState null", async () => {
      const topic = topicFixture({ status: "published" });
      // No mockSession: the beforeEach anonymous context stands.
      vi.mocked(core.getReadableTimetable).mockResolvedValue({
        timetable: calendarTimetable(),
        roles: [],
      });
      vi.mocked(core.getTopicById).mockResolvedValue(topic);
      vi.mocked(core.listTopicSessionSlotIds).mockResolvedValue([
        "33333333-3333-3333-3333-333333333333",
      ]);
      vi.mocked(core.buildCalendar).mockResolvedValue([slotRow()]);

      await withTestServer(async (baseUrl) => {
        const body = await request(baseUrl, topic.id);
        expect(body.errors).toBeUndefined();
        expect(body.data?.topicSessions).toHaveLength(1);
        expect(body.data?.topicSessions?.[0]?.viewerState).toBeNull();
        expect(body.data?.topicSessions?.[0]?.counts).toBeNull();
      });
    });

    it("gives a host the wash, over the forum's electors", async () => {
      const topic = topicFixture({ status: "published" });
      mockSession("host-1", ["host"]);
      vi.mocked(core.getReadableTimetable).mockResolvedValue({
        timetable: calendarTimetable(),
        roles: ["host"],
      });
      vi.mocked(core.getTopicById).mockResolvedValue(topic);
      vi.mocked(core.listTopicSessionSlotIds).mockResolvedValue([
        "33333333-3333-3333-3333-333333333333",
      ]);
      vi.mocked(core.getAudienceElectorIds).mockResolvedValue(["elector-9"]);
      vi.mocked(core.buildCalendar).mockResolvedValue([slotRow()]);

      await withTestServer(async (baseUrl) => {
        const body = await request(baseUrl, topic.id);
        expect(body.data?.topicSessions?.[0]?.counts).toEqual({ green: 4 });
        expect(body.data?.topicSessions?.[0]?.perUser).toEqual([
          { userId: "elector-9" },
        ]);
        // The wash charts THIS topic's hearters, as in the workbench
        // (Ed, QA 2026-08-16) — a card's wash is that topic's demand.
        expect(core.getAudienceElectorIds).toHaveBeenCalledWith(
          "11111111-1111-1111-1111-111111111111",
          { kind: "hearted_topic", topicId: topic.id },
        );
      });
    });

    it("returns null for unreadable forum / calendar off / foreign or unpublished topic", async () => {
      const topic = topicFixture({ status: "published" });
      mockSession("elector-1", ["elector"]);

      await withTestServer(async (baseUrl) => {
        // Unreadable forum.
        vi.mocked(core.getReadableTimetable).mockResolvedValue(null);
        expect(
          (await request(baseUrl, topic.id)).data?.topicSessions,
        ).toBeNull();

        // Calendar disabled.
        vi.mocked(core.getReadableTimetable).mockResolvedValue({
          timetable: timetableFixture(),
          roles: ["elector"],
        });
        vi.mocked(core.getTopicById).mockResolvedValue(topic);
        expect(
          (await request(baseUrl, topic.id)).data?.topicSessions,
        ).toBeNull();

        // Foreign topic (another forum's id).
        vi.mocked(core.getReadableTimetable).mockResolvedValue({
          timetable: calendarTimetable(),
          roles: ["elector"],
        });
        vi.mocked(core.getTopicById).mockResolvedValue(
          topicFixture({
            status: "published",
            timetableId: "99999999-9999-9999-9999-999999999999",
          }),
        );
        expect(
          (await request(baseUrl, topic.id)).data?.topicSessions,
        ).toBeNull();

        // Unpublished topic.
        vi.mocked(core.getTopicById).mockResolvedValue(
          topicFixture({ status: "submitted" }),
        );
        expect(
          (await request(baseUrl, topic.id)).data?.topicSessions,
        ).toBeNull();

        expect(core.listTopicSessionSlotIds).not.toHaveBeenCalled();
      });
    });
  });

  describe("sessionSlotCount (sessions-tab, 2026-08-14)", () => {
    const QUERY = `query($s: String!){
      topicFeed(idOrSlug: $s) { id sessionSlotCount }
    }`;

    const calendarTimetable = () =>
      timetableFixture({ settings: { calendar: { enabled: true } } });

    function feedTopicFixture(
      patch: Partial<core.FeedTopic> = {},
    ): core.FeedTopic {
      return {
        id: "22222222-2222-2222-2222-222222222222",
        timetableId: "11111111-1111-1111-1111-111111111111",
        hostId: "host-1",
        hostName: null,
        hostImage: null,
        hostSlug: null,
        title: "A topic",
        slug: "a-topic",
        bodyMd: "",
        coverImageUrl: null,
        status: "published",
        publishedAt: new Date("2026-08-01T00:00:00.000Z"),
        contentUpdatedAt: null,
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        heartCount: 0,
        weightedScore: 0,
        l2Score: 0,
        devotionScore: 0,
        viewerHasHearted: false,
        commentCount: 0,
        latestCommentAt: null,
        viewerCommentsSeenAt: null,
        ...patch,
      };
    }

    async function request(baseUrl: string) {
      const res = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: QUERY,
          variables: { s: "public-calendar" },
        }),
      });
      return (await res.json()) as {
        data?: { topicFeed: { id: string; sessionSlotCount: number }[] };
        errors?: unknown[];
      };
    }

    it("serves the batched future-session count on feed topics", async () => {
      const topic = feedTopicFixture();
      mockSession("elector-1", ["elector"]);
      vi.mocked(core.getReadableTimetable).mockResolvedValue({
        timetable: calendarTimetable(),
        roles: ["elector"],
      });
      vi.mocked(core.buildFeed).mockResolvedValue([topic]);
      vi.mocked(core.listCommentTreesForTopics).mockResolvedValue(new Map());
      vi.mocked(core.countTopicSessionSlots).mockResolvedValue(
        new Map([[topic.id, 2]]),
      );

      await withTestServer(async (baseUrl) => {
        const body = await request(baseUrl);
        expect(body.errors).toBeUndefined();
        expect(body.data?.topicFeed).toEqual([
          { id: topic.id, sessionSlotCount: 2 },
        ]);
        // One batched call per page — the loadCommentStats idiom; the
        // future-only cut (endsAt >= now, gte) lives in the core query.
        expect(core.countTopicSessionSlots).toHaveBeenCalledWith([topic.id]);
      });
    });

    it("stays 0, skipping the count query, while the calendar is off", async () => {
      const topic = feedTopicFixture();
      mockSession("elector-1", ["elector"]);
      vi.mocked(core.getReadableTimetable).mockResolvedValue({
        timetable: timetableFixture(),
        roles: ["elector"],
      });
      vi.mocked(core.buildFeed).mockResolvedValue([topic]);
      vi.mocked(core.listCommentTreesForTopics).mockResolvedValue(new Map());

      await withTestServer(async (baseUrl) => {
        const body = await request(baseUrl);
        expect(body.errors).toBeUndefined();
        expect(body.data?.topicFeed).toEqual([
          { id: topic.id, sessionSlotCount: 0 },
        ]);
        expect(core.countTopicSessionSlots).not.toHaveBeenCalled();
      });
    });
  });

  describe("feed adminComments (drafting tab, 2026-08-15)", () => {
    const QUERY = `query($s: String!){
      topicFeed(idOrSlug: $s) { id adminComments { id body } }
    }`;

    function feedTopic(hostId: string): core.FeedTopic {
      return {
        id: "22222222-2222-2222-2222-222222222222",
        timetableId: "11111111-1111-1111-1111-111111111111",
        hostId,
        hostName: null,
        hostImage: null,
        hostSlug: null,
        title: "A topic",
        slug: "a-topic",
        bodyMd: "",
        coverImageUrl: null,
        status: "published",
        publishedAt: new Date("2026-08-01T00:00:00.000Z"),
        contentUpdatedAt: null,
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        heartCount: 0,
        weightedScore: 0,
        l2Score: 0,
        devotionScore: 0,
        viewerHasHearted: false,
        commentCount: 0,
        latestCommentAt: null,
        viewerCommentsSeenAt: null,
      };
    }

    function draftingNode(): core.CommentNode {
      return {
        id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        parentId: null,
        authorId: "admin-1",
        authorName: null,
        authorImage: null,
        authorRoles: ["admin"],
        body: "Needs a sharper title",
        visibility: "admin_only",
        hidden: false,
        deleted: false,
        editedAt: null,
        pinnedAt: null,
        createdAt: new Date("2026-08-02T00:00:00.000Z"),
        replies: [],
      };
    }

    async function request(baseUrl: string) {
      const res = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: QUERY, variables: { s: "public" } }),
      });
      return (await res.json()) as {
        data?: { topicFeed: { id: string; adminComments: unknown[] }[] };
        errors?: unknown[];
      };
    }

    it("serves the owner their own drafting thread, batched", async () => {
      const topic = feedTopic("host-1");
      // host + elector, so the 💙 prefetch (a separate batched query with
      // its own coverage) stays out of this test's way.
      mockSession("host-1", ["host", "elector"]);
      vi.mocked(core.getReadableTimetable).mockResolvedValue({
        timetable: timetableFixture(),
        roles: ["host", "elector"],
      });
      vi.mocked(core.buildFeed).mockResolvedValue([topic]);
      vi.mocked(core.listCommentTreesForTopics).mockResolvedValue(
        new Map([[topic.id, [draftingNode()]]]),
      );

      await withTestServer(async (baseUrl) => {
        const body = await request(baseUrl);
        expect(body.errors).toBeUndefined();
        expect(body.data?.topicFeed[0]?.adminComments).toHaveLength(1);
        // One batched call for the page, not one query per card.
        expect(core.listCommentTreesForTopics).toHaveBeenCalledWith(
          [topic.id],
          {
            includeHostOnly: false,
            includeAdminOnly: true,
            includeHidden: false,
          },
        );
      });
    });

    it("gives another host nothing, and never asks the database", async () => {
      const topic = feedTopic("someone-else");
      mockSession("host-2", ["host", "elector"]);
      vi.mocked(core.getReadableTimetable).mockResolvedValue({
        timetable: timetableFixture(),
        roles: ["host", "elector"],
      });
      vi.mocked(core.buildFeed).mockResolvedValue([topic]);
      vi.mocked(core.listCommentTreesForTopics).mockResolvedValue(new Map());

      await withTestServer(async (baseUrl) => {
        const body = await request(baseUrl);
        expect(body.errors).toBeUndefined();
        expect(body.data?.topicFeed[0]?.adminComments).toEqual([]);
        expect(core.listCommentTreesForTopics).not.toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ includeAdminOnly: true }),
        );
      });
    });
  });

  describe("addSlotSession (location-less pencils, 2026-08-14)", () => {
    const PENCIL = `mutation($slot: String!, $topic: String!){
      addSlotSession(slotId: $slot, topicId: $topic)
    }`;

    function mockPencilWorld() {
      const slot = slotFixture();
      const topic = topicFixture({ status: "published", hostId: "host-1" });
      vi.mocked(core.getSlotById).mockResolvedValue(slot);
      vi.mocked(core.getTimetableById).mockResolvedValue(
        timetableFixture({ settings: { calendar: { enabled: true } } }),
      );
      vi.mocked(core.getTopicById).mockResolvedValue(topic);
      mockSession("host-1", ["host"]);
      return { slot, topic };
    }

    async function pencil(baseUrl: string, slotId: string, topicId: string) {
      const res = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: PENCIL,
          variables: { slot: slotId, topic: topicId },
        }),
      });
      return (await res.json()) as {
        data?: { addSlotSession: boolean | null };
        errors?: unknown[];
      };
    }

    it("pencils with no location, even on a slot with configured locations", async () => {
      const { slot, topic } = mockPencilWorld();
      vi.mocked(core.getSlotById).mockResolvedValue(
        slotFixture({ locations: ["Hall", "Classroom"] }),
      );
      vi.mocked(core.slotSubjectTaken).mockResolvedValue(false);

      await withTestServer(async (baseUrl) => {
        const body = await pencil(baseUrl, slot.id, topic.id);
        expect(body.errors).toBeUndefined();
        expect(body.data?.addSlotSession).toBe(true);
        expect(core.addSlotSession).toHaveBeenCalledWith(
          slot.id,
          expect.objectContaining({
            topicId: topic.id,
            status: "proposed",
          }),
        );
        // The room is decided at confirm time — the pencil carries no
        // location at all (core inserts "").
        expect(
          vi.mocked(core.addSlotSession).mock.calls[0]![1],
        ).not.toHaveProperty("location");
      });
    });

    it("refuses a duplicate pencil for the same topic", async () => {
      const { slot, topic } = mockPencilWorld();
      vi.mocked(core.slotSubjectTaken).mockResolvedValue(true);

      await withTestServer(async (baseUrl) => {
        const body = await pencil(baseUrl, slot.id, topic.id);
        expect(body.errors?.length).toBeGreaterThan(0);
        expect(core.addSlotSession).not.toHaveBeenCalled();
      });
    });
  });

  describe("updateSlotSession (confirm-time locations, 2026-08-14)", () => {
    const UPDATE = `mutation($session: String!, $status: String, $loc: String){
      updateSlotSession(sessionId: $session, status: $status, location: $loc)
    }`;

    function mockConfirmWorld(sessionPatch: Partial<SlotSession> = {}) {
      const session = slotSessionFixture(sessionPatch);
      const slot = slotFixture({ locations: ["Hall", "Classroom"] });
      const topic = topicFixture({ status: "published", hostId: "host-1" });
      vi.mocked(core.getSlotSessionById).mockResolvedValue(session);
      vi.mocked(core.getSlotById).mockResolvedValue(slot);
      vi.mocked(core.getTimetableById).mockResolvedValue(
        timetableFixture({ settings: { calendar: { enabled: true } } }),
      );
      vi.mocked(core.getTopicById).mockResolvedValue(topic);
      mockSession("admin-1", ["admin"]);
      return { session, slot, topic };
    }

    async function update(
      baseUrl: string,
      vars: { session: string; status?: string; loc?: string },
    ) {
      const res = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: UPDATE, variables: vars }),
      });
      return (await res.json()) as {
        data?: { updateSlotSession: boolean | null };
        errors?: { message: string }[];
      };
    }

    it("confirms with a free location", async () => {
      const { session, slot } = mockConfirmWorld();
      vi.mocked(core.confirmedLocationTaken).mockResolvedValue(false);
      vi.mocked(core.updateSlotSessionRow).mockResolvedValue(
        slotSessionFixture({ status: "confirmed", location: "Hall" }),
      );

      await withTestServer(async (baseUrl) => {
        const body = await update(baseUrl, {
          session: session.id,
          status: "confirmed",
          loc: "Hall",
        });
        expect(body.errors).toBeUndefined();
        expect(body.data?.updateSlotSession).toBe(true);
        expect(core.confirmedLocationTaken).toHaveBeenCalledWith(
          slot.id,
          "Hall",
          session.id,
        );
        expect(core.updateSlotSessionRow).toHaveBeenCalledWith(session.id, {
          status: "confirmed",
          url: undefined,
          location: "Hall",
        });
      });
    });

    it("refuses to confirm into a location another confirmed session holds", async () => {
      const { session } = mockConfirmWorld();
      vi.mocked(core.confirmedLocationTaken).mockResolvedValue(true);

      await withTestServer(async (baseUrl) => {
        const body = await update(baseUrl, {
          session: session.id,
          status: "confirmed",
          loc: "Hall",
        });
        expect(body.errors?.[0]?.message).toBe(
          "That location is already confirmed for this time",
        );
        expect(core.updateSlotSessionRow).not.toHaveBeenCalled();
      });
    });

    it("refuses to move a confirmed session to a taken location", async () => {
      // No status arg: the session is already confirmed, only the room moves.
      const { session } = mockConfirmWorld({
        status: "confirmed",
        location: "Hall",
      });
      vi.mocked(core.confirmedLocationTaken).mockResolvedValue(true);

      await withTestServer(async (baseUrl) => {
        const body = await update(baseUrl, {
          session: session.id,
          loc: "Classroom",
        });
        expect(body.errors?.[0]?.message).toBe(
          "That location is already confirmed for this time",
        );
        expect(core.updateSlotSessionRow).not.toHaveBeenCalled();
      });
    });
  });

  describe("proposeSlot (slot-level location, 2026-08-14)", () => {
    it("passes the location to the slot's offered set; the session is born location-less", async () => {
      // The location arg feeds the SLOT (its offered set); the session is
      // location-less by construction — core's addSlotSession no longer
      // accepts a location at all.
      const topic = topicFixture({ status: "published", hostId: "host-1" });
      mockSession("host-1", ["host"]);
      vi.mocked(core.getReadableTimetable).mockResolvedValue({
        timetable: timetableFixture({
          settings: { calendar: { enabled: true } },
        }),
        roles: ["host"],
      });
      vi.mocked(core.getTopicById).mockResolvedValue(topic);
      vi.mocked(core.proposeSlot).mockResolvedValue({
        slot: slotFixture({ locations: ["Hall"] }),
        session: slotSessionFixture(),
      });

      await withTestServer(async (baseUrl) => {
        const res = await fetch(`${baseUrl}/graphql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `mutation($s: String!, $a: String!, $b: String!, $loc: String, $t: String){
              proposeSlot(idOrSlug: $s, startsAt: $a, endsAt: $b, location: $loc, topicId: $t) { id }
            }`,
            variables: {
              s: "public-calendar",
              a: "2026-09-01T18:00:00.000Z",
              b: "2026-09-01T20:00:00.000Z",
              loc: "Hall",
              t: topic.id,
            },
          }),
        });
        const body = (await res.json()) as {
          data?: { proposeSlot: { id: string } | null };
          errors?: unknown[];
        };
        expect(body.errors).toBeUndefined();
        expect(core.proposeSlot).toHaveBeenCalledWith(
          "11111111-1111-1111-1111-111111111111",
          "host-1",
          {
            startsAt: new Date("2026-09-01T18:00:00.000Z"),
            endsAt: new Date("2026-09-01T20:00:00.000Z"),
            location: "Hall",
            topicId: topic.id,
            sessionHostId: "host-1",
          },
        );
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
      pinnedAt: null,
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

  it("only lets the topic's author pin top-level comments", async () => {
    const commentRow = {
      id: "comment-1",
      topicId: "22222222-2222-2222-2222-222222222222",
      parentId: null,
      authorId: "elector-1",
      body: "worth keeping on top",
      visibility: "public" as const,
      hiddenAt: null,
      hiddenByUserId: null,
      deletedAt: null,
      editedAt: null,
      pinnedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const gql = (baseUrl: string, query: string) =>
      fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
    const pinMutation = `mutation {
      pinComment(commentId: "comment-1", pinned: true) { id pinnedAt }
    }`;

    await withTestServer(async (baseUrl) => {
      vi.mocked(core.getCommentById).mockResolvedValue(commentRow);
      vi.mocked(core.getTopicById).mockResolvedValue(
        topicFixture({ status: "published" }), // hostId: "host-1"
      );

      // An admin who isn't the author: refused — pinning is the author's
      // curation gesture, not moderation.
      mockSession("admin-1", ["admin"]);
      const denied = (await (await gql(baseUrl, pinMutation)).json()) as {
        errors?: unknown[];
        data?: { pinComment: unknown };
      };
      expect(denied.errors?.length).toBeGreaterThan(0);
      expect(denied.data?.pinComment ?? null).toBeNull();
      expect(core.setCommentPinned).not.toHaveBeenCalled();

      // The topic's author: pin lands and returns the stamp.
      mockSession("host-1", ["host"]);
      const pinnedAt = new Date("2026-08-17T12:00:00.000Z");
      vi.mocked(core.setCommentPinned).mockResolvedValue({
        ...commentRow,
        pinnedAt,
      });
      const pinned = (await (await gql(baseUrl, pinMutation)).json()) as {
        data: { pinComment: { pinnedAt: string | null } };
      };
      expect(pinned.data.pinComment.pinnedAt).toBe(pinnedAt.toISOString());
      expect(core.setCommentPinned).toHaveBeenCalledWith(
        "comment-1",
        true,
        "host-1",
      );

      // A reply can't be pinned, even by the author.
      vi.mocked(core.setCommentPinned).mockClear();
      vi.mocked(core.getCommentById).mockResolvedValue({
        ...commentRow,
        parentId: "comment-0",
      });
      const replyDenied = (await (await gql(baseUrl, pinMutation)).json()) as {
        errors?: unknown[];
      };
      expect(replyDenied.errors?.length).toBeGreaterThan(0);
      expect(core.setCommentPinned).not.toHaveBeenCalled();
    });
  });

  describe("personal API tokens", () => {
    const HEART = `mutation { heartTopic(topicId: "22222222-2222-2222-2222-222222222222") { hearted } }`;

    async function post(baseUrl: string, query: string) {
      const res = await fetch(`${baseUrl}/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer tpk_integration-test-secret",
        },
        body: JSON.stringify({ query }),
      });
      return (await res.json()) as {
        data: Record<string, unknown> | null;
        errors?: { message: string }[];
      };
    }

    function publishedTopic() {
      const topic = topicFixture({ status: "published" });
      vi.mocked(core.getTopicById).mockResolvedValue(topic);
      vi.mocked(core.getTimetableById).mockResolvedValue(timetableFixture());
      return topic;
    }

    it("lets a token with hearts:write ❤️ a topic", async () => {
      const topic = publishedTopic();
      mockTokenAuth("elector-1", ["elector"], ["hearts:write"]);
      vi.mocked(core.toggleHeart).mockResolvedValue({ hearted: true });

      await withTestServer(async (baseUrl) => {
        const body = await post(baseUrl, HEART);

        expect(body.errors).toBeUndefined();
        expect(core.toggleHeart).toHaveBeenCalledWith(topic.id, "elector-1");
      });
    });

    it("refuses the same ❤️ when the token lacks the scope", async () => {
      publishedTopic();
      mockTokenAuth("elector-1", ["elector"], ["comments:write"]);

      await withTestServer(async (baseUrl) => {
        const body = await post(baseUrl, HEART);

        expect(body.errors?.[0]?.message).toMatch(/hearts:write/);
        expect(core.toggleHeart).not.toHaveBeenCalled();
      });
    });

    it("refuses moderation to an admin's token holding every scope", async () => {
      publishedTopic();
      mockTokenAuth("admin-1", ["admin"], [...API_TOKEN_SCOPES]);

      await withTestServer(async (baseUrl) => {
        const body = await post(
          baseUrl,
          `mutation { moderateTopic(topicId: "22222222-2222-2222-2222-222222222222", action: "publish") { id } }`,
        );

        expect(body.errors?.[0]?.message).toMatch(/Not allowed/);
      });
    });

    it("refuses token administration, so a token can't mint another", async () => {
      mockTokenAuth("member-1", ["elector"], [...API_TOKEN_SCOPES]);

      await withTestServer(async (baseUrl) => {
        const body = await post(
          baseUrl,
          `mutation { createApiToken(name: "second", scopes: []) { secret } }`,
        );

        expect(body.errors?.[0]?.message).toMatch(/Not allowed/);
      });
    });

    it("leaves reads open to a token with no write scopes at all", async () => {
      const timetable = timetableFixture();
      mockTokenAuth("member-1", ["elector"], []);
      vi.mocked(core.getReadableTimetable).mockResolvedValue({
        timetable,
        roles: ["elector"],
      });

      await withTestServer(async (baseUrl) => {
        const body = await post(
          baseUrl,
          `query { forum(idOrSlug: "${timetable.slug}") { id } }`,
        );

        expect(body.errors).toBeUndefined();
        expect(body.data?.forum).toMatchObject({ id: timetable.id });
      });
    });

    /** Session-authenticated token minting: the cap and the expiry default
     * (hardening pass adopting #273). */
    describe("minting", () => {
      const NEW_TOKEN = {
        id: "token-new",
        userId: "",
        name: "fresh",
        prefix: "abcdefgh",
        scopes: [],
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
        createdAt: new Date("2026-08-14T00:00:00.000Z"),
      };

      async function mint(baseUrl: string, args = "") {
        const res = await fetch(`${baseUrl}/graphql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `mutation { createApiToken(name: "fresh", scopes: []${args}) { secret } }`,
          }),
        });
        return (await res.json()) as {
          data: Record<string, unknown> | null;
          errors?: { message: string }[];
        };
      }

      it("defaults an omitted expiry to 90 days, server-side", async () => {
        mockSession("minter-default", ["elector"]);
        vi.mocked(core.countActiveApiTokens).mockResolvedValue(0);
        vi.mocked(core.createApiToken).mockResolvedValue({
          secret: "tpk_fresh-secret",
          token: NEW_TOKEN,
        });

        await withTestServer(async (baseUrl) => {
          const before = Date.now();
          const body = await mint(baseUrl);
          expect(body.errors).toBeUndefined();

          const input = vi.mocked(core.createApiToken).mock.calls[0]?.[1];
          const expiresAt = input?.expiresAt;
          expect(expiresAt).toBeInstanceOf(Date);
          const ninetyDays = 90 * 86_400_000;
          expect((expiresAt as Date).getTime() - before).toBeGreaterThan(
            ninetyDays - 60_000,
          );
          expect((expiresAt as Date).getTime() - before).toBeLessThan(
            ninetyDays + 60_000,
          );
        });
      });

      it("still mints a never-expiring token on an EXPLICIT null", async () => {
        mockSession("minter-never", ["elector"]);
        vi.mocked(core.countActiveApiTokens).mockResolvedValue(0);
        vi.mocked(core.createApiToken).mockResolvedValue({
          secret: "tpk_fresh-secret",
          token: NEW_TOKEN,
        });

        await withTestServer(async (baseUrl) => {
          const body = await mint(baseUrl, ", expiresInDays: null");
          expect(body.errors).toBeUndefined();
          expect(
            vi.mocked(core.createApiToken).mock.calls[0]?.[1],
          ).toMatchObject({ expiresAt: null });
        });
      });

      it("refuses a 26th active token, and never mints it", async () => {
        mockSession("minter-capped", ["elector"]);
        vi.mocked(core.countActiveApiTokens).mockResolvedValue(25);

        await withTestServer(async (baseUrl) => {
          const body = await mint(baseUrl);
          expect(body.errors?.[0]?.message).toMatch(/25 active tokens/);
          expect(core.createApiToken).not.toHaveBeenCalled();
        });
      });

      it("rate-limits minting to 10 an hour per user", async () => {
        mockSession("minter-hasty", ["elector"]);
        vi.mocked(core.countActiveApiTokens).mockResolvedValue(0);
        vi.mocked(core.createApiToken).mockResolvedValue({
          secret: "tpk_fresh-secret",
          token: NEW_TOKEN,
        });

        await withTestServer(async (baseUrl) => {
          for (let i = 0; i < 10; i++) {
            const body = await mint(baseUrl);
            expect(body.errors).toBeUndefined();
          }
          const blocked = await mint(baseUrl);
          expect(blocked.errors?.[0]?.message).toMatch(
            /creating API tokens too quickly/,
          );
          expect(core.createApiToken).toHaveBeenCalledTimes(10);
        });
      });
    });

    /**
     * The REST surface must never accept a personal token: scope enforcement is
     * a GraphQL plugin that can't see REST requests, so a token scoped to
     * nothing but hearts:write would otherwise reach invites, role edits, and
     * uploads as a fully authenticated user. These two run the REAL
     * buildContext — mocking it would test nothing.
     */
    describe("REST refuses personal tokens", () => {
      const routes = [
        {
          name: "invites",
          url: (baseUrl: string) => `${baseUrl}/api/forums/timetable-1/invites`,
          method: "POST",
          body: { emails: ["someone@example.com"], roles: ["elector"] },
        },
        {
          name: "member role edits",
          url: (baseUrl: string) =>
            `${baseUrl}/api/memberships/membership-1/roles`,
          method: "PATCH",
          body: { roles: ["admin"] },
        },
      ];

      for (const route of routes) {
        it(`rejects a personal token on ${route.name}`, async () => {
          if (!real.buildContext) throw new Error("real buildContext missing");
          vi.mocked(context.buildContext).mockImplementation(real.buildContext);

          await withTestServer(async (baseUrl) => {
            const res = await fetch(route.url(baseUrl), {
              method: route.method,
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer tpk_integration-test-secret",
              },
              body: JSON.stringify(route.body),
            });

            expect(res.status).toBe(401);
            await expect(res.json()).resolves.toEqual({
              error: "Not authenticated",
            });
            expect(core.inviteEmails).not.toHaveBeenCalled();
            expect(core.setMemberRoles).not.toHaveBeenCalled();
          });
        });
      }
    });
  });
});
