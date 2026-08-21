import { createApiApp } from "./app";
import { env } from "./env";
import { structuredLogger } from "./http/request-log";

const log = structuredLogger("server");

const app = createApiApp();

const server = app.listen(env.port, () => {
  console.log(`[api] listening on http://localhost:${env.port}`);
  console.log(`[api] GraphQL  http://localhost:${env.port}/graphql`);
});

/**
 * Drain on shutdown (ops R10). App Platform sends SIGTERM on every deploy and
 * every restart; without this the process exits immediately and whoever was
 * mid-request gets a connection reset. `server.close()` stops accepting new
 * connections and waits for in-flight ones to finish.
 *
 * The timer is a backstop: a wedged request must not hold the deploy open
 * forever. It's unref'd so it can't itself keep the process alive once the
 * drain finishes early.
 */
const SHUTDOWN_GRACE_MS = 10_000;
let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`received ${signal}, draining connections`);

  const forceExit = setTimeout(() => {
    log.error(`drain exceeded ${SHUTDOWN_GRACE_MS}ms, exiting anyway`);
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  forceExit.unref();

  server.close((err) => {
    if (err) {
      log.error("error while closing server", err);
      process.exit(1);
    }
    log.info("drained cleanly");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
