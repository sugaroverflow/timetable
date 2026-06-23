import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

type RequestWithId = Request & { requestId?: string };
type LogLevel = "debug" | "info" | "warn" | "error";

function writeLog(level: LogLevel, event: string, fields: Record<string, unknown>) {
  const entry = {
    level,
    event,
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
    };
  }
  return {
    errorName: "UnknownError",
    errorMessage: String(error),
  };
}

export function getRequestId(req: Request): string | undefined {
  return (req as RequestWithId).requestId;
}

export function logRequestError(
  req: Request,
  error: unknown,
  fields: Record<string, unknown> = {},
): void {
  writeLog("error", "request_error", {
    requestId: getRequestId(req),
    method: req.method,
    path: req.originalUrl,
    ...fields,
    ...errorDetails(error),
  });
}

export function structuredLogger(component: string): Record<
  LogLevel,
  (...args: unknown[]) => void
> {
  return {
    debug: (...args) => writeLog("debug", "log", { component, args }),
    info: (...args) => writeLog("info", "log", { component, args }),
    warn: (...args) => writeLog("warn", "log", { component, args }),
    error: (...args) => writeLog("error", "log", { component, args }),
  };
}

export function requestLog(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = randomUUID();
  const started = Date.now();
  (req as RequestWithId).requestId = requestId;
  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    const ms = Date.now() - started;
    writeLog(res.statusCode >= 500 ? "error" : "info", "request", {
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: ms,
    });
  });

  next();
}
