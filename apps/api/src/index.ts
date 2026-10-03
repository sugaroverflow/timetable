import { createApiApp } from "./app";
import { env } from "./env";
import { structuredLogger } from "./http/request-log";
import { pushBootLine } from "./push-config";
import {
  createPushSweeper,
  pushSweepDeps,
  startPushSweepTimer,
} from "./push-sweep";

const log = structuredLogger("server");

const app = createApiApp();

const server = app.listen(env.port, () => {
  console.log(`[api] listening on http://localhost:${env.port}`);
  console.log(`[api] GraphQL  http://localhost:${env.port}/graphql`);
});

/** The Web Push sweep (docs/web-push-plan.md §3.2): once a minute, only
 * when VAPID keys are configured — without them nothing starts. While
 * PUSH_PAUSED it still advances its window and sends nothing. */
const pushSweep = env.push
  ? startPushSweepTimer(
      createPushSweeper(pushSweepDeps(env.push), {
        info: (msg) => log.info(msg),
        error: (msg, err) => log.error(msg, err),
      }),
    )
  : null;
if (env.push) console.log(pushBootLine(env.push));

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

  // The push sweep stops ticking at once; an in-flight sweep (at most a
  // few 5 s sends behind a limiter of 4) is awaited before exit, so an
  // ordinary restart loses no claimed alerts. The grace timer still caps it.
  const sweepDone = pushSweep ? pushSweep.stop() : Promise.resolve();

  server.close((err) => {
    if (err) {
      log.error("error while closing server", err);
      process.exit(1);
    }
    void sweepDone.then(() => {
      log.info("drained cleanly");
      process.exit(0);
    });
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
