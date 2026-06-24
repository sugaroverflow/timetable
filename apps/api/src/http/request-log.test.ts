import type { Request } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import { logRequestError } from "./request-log";

function requestFixture(): Request {
  return {
    method: "POST",
    originalUrl: "/graphql",
    requestId: "request-1",
  } as unknown as Request;
}

describe("logRequestError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs nested error causes and common driver fields", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const driverError = Object.assign(new Error("driver failed"), {
      code: "ERR_DRIVER",
      detail: "bad timestamp parameter",
    });
    const error = new Error("rate limit unavailable", {
      cause: driverError,
    });

    logRequestError(requestFixture(), error, { component: "rate-limit" });

    expect(consoleError).toHaveBeenCalledOnce();
    const [line] = consoleError.mock.calls[0] ?? [];
    expect(JSON.parse(String(line))).toMatchObject({
      level: "error",
      event: "request_error",
      requestId: "request-1",
      method: "POST",
      path: "/graphql",
      component: "rate-limit",
      errorName: "Error",
      errorMessage: "rate limit unavailable",
      cause: {
        errorName: "Error",
        errorMessage: "driver failed",
        code: "ERR_DRIVER",
        detail: "bad timestamp parameter",
      },
    });
  });
});
