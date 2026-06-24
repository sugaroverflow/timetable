import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import type { IcsSlot, ReadableTimetable } from "@timetable/core";
import * as core from "@timetable/core";
import type { Timetable } from "@timetable/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiApp } from "./app";

vi.mock("@timetable/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@timetable/core")>();
  return {
    ...actual,
    getReadableTimetable: vi.fn(),
    getSlotsForIcs: vi.fn(),
    getUserByIcsToken: vi.fn(),
    listDigestRecipients: vi.fn(),
  };
});

const originalCronSecret = process.env.CRON_SECRET;

function restoreCronSecret() {
  if (originalCronSecret === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = originalCronSecret;
  }
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

afterEach(() => {
  restoreCronSecret();
  vi.mocked(core.getReadableTimetable).mockReset();
  vi.mocked(core.getSlotsForIcs).mockReset();
  vi.mocked(core.getUserByIcsToken).mockReset();
  vi.mocked(core.listDigestRecipients).mockReset();
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
      const res = await fetch(
        `${baseUrl}/api/timetables/timetable-1/invites`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emails: ["host@example.com"] }),
        },
      );

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
    const timetable = {
      id: "11111111-1111-1111-1111-111111111111",
      slug: "public-calendar",
      name: "Public Calendar",
      description: null,
      privacy: "public",
      customDomain: null,
      settings: {},
      ownerId: "owner-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    } satisfies Timetable;
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
});
