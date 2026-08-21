import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendEmail } from "./email";

/**
 * Covers the ops R4 hardening: Resend's default limit is 2 requests/second,
 * and the digest job used to fire ten concurrent unthrottled sends with no
 * retry — so the first run against a real cohort would 429 and abort the
 * whole run.
 */
const ORIGINAL_ENV = { ...process.env };

function response(status: number, headers: Record<string, string> = {}) {
  return new Response(status === 200 ? "{}" : "rate limited", {
    status,
    headers,
  });
}

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test";
  // Keep the pacing chain honest but fast: 1000/sec => a 1ms gap.
  process.env.RESEND_MAX_RPS = "1000";
  process.env.EMAIL_MAX_ATTEMPTS = "3";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

const send = () =>
  sendEmail({ to: "a@example.com", subject: "s", html: "<p>h</p>" });

describe("sendEmail", () => {
  it("sends once when Resend accepts it", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response(200));

    await expect(send()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 and succeeds", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(429, { "retry-after": "0" }))
      .mockResolvedValueOnce(response(200));

    await expect(send()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 5xx and succeeds", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200));

    await expect(send()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a permanent 4xx", async () => {
    // A bad address or a bad key will never succeed; retrying just burns
    // quota and delays the rest of the run.
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response(422));

    await expect(send()).rejects.toThrow(/422/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after the attempt budget and still throws", async () => {
    // A fresh Response per call: a body can only be read once, and the real
    // fetch hands back a new one every time.
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => response(429, { "retry-after": "0" }));

    await expect(send()).rejects.toThrow(/429/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a network-level failure", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(response(200));

    await expect(send()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("logs instead of sending when no API key is configured", async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = vi.spyOn(globalThis, "fetch");
    vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(send()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("paces concurrent sends rather than firing them all at once", async () => {
    // 4 sends at 100/sec => at least 3 gaps of 10ms.
    process.env.RESEND_MAX_RPS = "100";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(200));

    const started = Date.now();
    await Promise.all([send(), send(), send(), send()]);

    expect(Date.now() - started).toBeGreaterThanOrEqual(25);
  });
});
