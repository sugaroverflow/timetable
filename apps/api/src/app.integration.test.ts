/* eslint-disable max-lines-per-function -- audit debt (2026-07-22): decomposition queued — remove this disable when refactoring */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import type { IcsSlot, ReadableTimetable } from "@timetable/core";
import * as core from "@timetable/core";
import type { Timetable, TimetableMembership } from "@timetable/db";
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
    countViewerPublishedHearts: vi.fn(),
    createLocalUser: vi.fn(),
    getMembership: vi.fn(),
    getMembershipById: vi.fn(),
    getReadableTimetable: vi.fn(),
    getSlotsForIcs: vi.fn(),
    getTimetableById: vi.fn(),
    getUserById: vi.fn(),
    getUserByIcsToken: vi.fn(),
    inviteEmails: vi.fn(),
    listDigestRecipients: vi.fn(),
    listHostTopics: vi.fn(),
    markInviteSent: vi.fn(),
    setMemberRoles: vi.fn(),
    updateTimetableSettings: vi.fn(),
  };
});

vi.mock("./auth/clerk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./auth/clerk")>();
  return {
    ...actual,
    getOrCreateClerkUser: vi.fn(),
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
          bio: null,
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
    description: null,
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
    lastSeenFeedAt: null,
    lastSeenNotificationsAt: null,
    inviteSentAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
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
  vi.mocked(core.countViewerPublishedHearts).mockReset();
  vi.mocked(core.createLocalUser).mockReset();
  vi.mocked(core.getMembership).mockReset();
  vi.mocked(core.getMembershipById).mockReset();
  vi.mocked(core.getReadableTimetable).mockReset();
  vi.mocked(core.getSlotsForIcs).mockReset();
  vi.mocked(core.getTimetableById).mockReset();
  vi.mocked(core.getUserById).mockReset();
  vi.mocked(core.getUserByIcsToken).mockReset();
  vi.mocked(core.inviteEmails).mockReset();
  vi.mocked(core.listDigestRecipients).mockReset();
  vi.mocked(core.listHostTopics).mockReset();
  vi.mocked(core.markInviteSent).mockReset();
  vi.mocked(core.setMemberRoles).mockReset();
  vi.mocked(core.updateTimetableSettings).mockReset();
  vi.mocked(clerk.getOrCreateClerkUser).mockReset();
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
      const res = await fetch(`${baseUrl}/api/timetables`, {
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
      const res = await fetch(`${baseUrl}/api/timetables/timetable-1/invites`, {
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
      const res = await fetch(`${baseUrl}/api/timetables/timetable-1/invites`, {
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
      const res = await fetch(`${baseUrl}/api/timetables/timetable-1/invites`, {
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
      const res = await fetch(`${baseUrl}/api/timetables/timetable-1/people`, {
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
      const res = await fetch(`${baseUrl}/api/timetables/timetable-1/people`, {
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
        `${baseUrl}/api/timetables/private-calendar/calendar.ics`,
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

  it("serves readable ICS calendars with calendar headers and slot content", async () => {
    const timetable = timetableFixture();
    const readable = { timetable, roles: [] } satisfies ReadableTimetable;
    const slots: IcsSlot[] = [
      {
        id: "slot-1",
        startsAt: new Date("2026-02-01T10:00:00.000Z"),
        endsAt: new Date("2026-02-01T11:00:00.000Z"),
        location: "Main Hall",
        topicTitles: ["Opening Session"],
      },
    ];

    vi.mocked(core.getReadableTimetable).mockResolvedValue(readable);
    vi.mocked(core.getSlotsForIcs).mockResolvedValue(slots);

    await withTestServer(async (baseUrl) => {
      const res = await fetch(
        `${baseUrl}/api/timetables/public-calendar/calendar.ics`,
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
      expect(body).toContain("LOCATION:Main Hall");
      expect(core.getSlotsForIcs).toHaveBeenCalledWith(timetable.id);
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
            timetable(idOrSlug: $s) { viewerHeartedPublishedCount }
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
            updateTimetableSettings(
              idOrSlug: $s
              digestNewTopics: true
              digestReplies: false
            ) { id }
          }`,
          variables: { s: timetable.slug },
        }),
      });

      expect(res.status).toBe(200);
      expect(core.updateTimetableSettings).toHaveBeenCalledWith(timetable.id, {
        digestDefaults: { digestNewTopics: true, digestReplies: false },
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
            timetable(idOrSlug: $s) { viewerHeartedPublishedCount }
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
});
