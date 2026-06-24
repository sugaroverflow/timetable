import "./load-env";

import cors from "cors";
import express from "express";
import { createYoga } from "graphql-yoga";

import { buildContext } from "./context";
import { env } from "./env";
import { useOperationLimits } from "./graphql/depth-limit";
import { schema } from "./graphql/schema";
import {
  createDatabaseRateLimitStore,
  rateLimit,
} from "./http/rate-limit";
import { requestLog, structuredLogger } from "./http/request-log";
import { restRouter } from "./rest/router";

export function createApiApp() {
  const app = express();

  app.set("trust proxy", env.trustProxyHops);

  app.use(requestLog);

  app.use(
    cors({
      origin: env.webOrigin,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );

  const limiter = rateLimit({
    windowMs: env.rateLimitWindowMs,
    max: env.rateLimitMax,
    keyPrefix: env.rateLimitKeyPrefix,
    store:
      env.rateLimitBackend === "database"
        ? createDatabaseRateLimitStore({
            windowMs: env.rateLimitWindowMs,
            cleanupIntervalMs: env.rateLimitCleanupIntervalMs,
          })
        : undefined,
  });

  const yoga = createYoga({
    schema,
    graphqlEndpoint: "/graphql",
    // CORS is handled by the express middleware above.
    cors: false,
    graphiql: !env.isProd,
    logging: structuredLogger("graphql"),
    plugins: [
      useOperationLimits({
        maxDepth: env.graphqlMaxDepth,
        maxCost: env.graphqlMaxCost,
      }),
    ],
    context: ({ request }) =>
      buildContext({
        authHeader: request.headers.get("authorization"),
        cookieHeader: request.headers.get("cookie"),
      }),
  });

  app.use(yoga.graphqlEndpoint, limiter, yoga);

  app.use("/api", limiter, express.json(), restRouter);

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}
