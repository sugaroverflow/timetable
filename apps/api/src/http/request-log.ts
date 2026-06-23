import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

export function requestLog(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = randomUUID();
  const started = Date.now();
  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    const ms = Date.now() - started;
    console.log(
      JSON.stringify({
        level: res.statusCode >= 500 ? "error" : "info",
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: ms,
      }),
    );
  });

  next();
}
