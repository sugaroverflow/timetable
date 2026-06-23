import "./load-env";

import cors from "cors";
import express from "express";
import { createYoga } from "graphql-yoga";

import { buildContext } from "./context";
import { env } from "./env";
import { schema } from "./graphql/schema";
import { restRouter } from "./rest/router";

const app = express();

app.use(
  cors({
    origin: env.webOrigin,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

const yoga = createYoga({
  schema,
  graphqlEndpoint: "/graphql",
  // CORS is handled by the express middleware above.
  cors: false,
  graphiql: !env.isProd,
  context: ({ request }) =>
    buildContext({
      authHeader: request.headers.get("authorization"),
      cookieHeader: request.headers.get("cookie"),
    }),
});

app.use(yoga.graphqlEndpoint, yoga);

app.use("/api", express.json(), restRouter);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(env.port, () => {
  console.log(`[api] listening on http://localhost:${env.port}`);
  console.log(`[api] GraphQL  http://localhost:${env.port}/graphql`);
});
