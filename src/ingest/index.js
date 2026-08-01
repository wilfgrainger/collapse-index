/**
 * Ingestion Worker.
 *
 * Scheduled only. This Worker has write access to the evidence store, so it
 * deliberately exposes no public route: there is no fetch handler that can be
 * reached from the internet, and therefore no way to trigger a write by URL.
 *
 * Local operators run it with `wrangler dev --test-scheduled`.
 */

import { runIngestion } from "./orchestrator.js";

export default {
  async scheduled(controller, env, ctx) {
    const now = new Date(controller.scheduledTime).toISOString();
    ctx.waitUntil(
      runIngestion(env, { trigger: controller.cron ?? "cron", now })
        .then((result) => {
          console.log(JSON.stringify({
            event: "ingestion_complete",
            runId: result.runId,
            status: result.status,
            changed: result.changed,
            failed: result.failed,
            written: result.written,
            snapshotCreated: result.snapshotCreated
          }));
        })
        .catch((error) => {
          // A run that dies wholesale must still be visible in logs; the
          // per-source audit rows record everything that got as far as running.
          console.error(JSON.stringify({
            event: "ingestion_failed",
            message: error?.message ?? "unknown error"
          }));
        })
    );
  }
};
