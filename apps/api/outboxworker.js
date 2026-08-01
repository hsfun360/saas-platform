// outboxworker.js
//
// Thin bootstrap entry point for the outbox/notification worker (referenced by
// package.json `worker:outbox`). Two modes, selected by WORKER_MODE:
//
//   poll  (default) - the legacy always-on loop: polls the outbox every ~5s and
//           scans workflow SLA reminders every 5 min. Requires the service to
//           be deployed with --min-instances=1 --no-cpu-throttling (an idle
//           Cloud Run instance is otherwise throttled and the loop stops).
//
//   drain - scale-to-zero: no background loop. POST /drain claims and sends
//           everything pending, then returns. Triggered by (a) the api's
//           best-effort post-commit ping (platform/outboxWorkerPing.js) for
//           seconds-fast delivery, and (b) a Cloud Scheduler sweep
//           (POST /drain?sweep=1, which also runs the workflow SLA scan) as
//           the delivery guarantee for lost pings. Deploy with min-instances=0
//           and default CPU throttling; Cloud Run bills only while draining.
//           Auth is Cloud Run IAM (--no-allow-unauthenticated + run.invoker),
//           so any request reaching the handler is already authenticated.

const http = require('http');
const PORT = process.env.PORT || 8080;
const MODE = process.env.WORKER_MODE === 'drain' ? 'drain' : 'poll';

const { startWorker, drainOutbox } = require('./src/modules/notification/notification.worker');
const { scanSlaReminders } = require('./src/modules/workflow/workflow.reminders');

if (MODE === 'drain') {
    http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        if (req.method === 'POST' && url.pathname === '/drain') {
            try {
                // The scheduler sweep also owns the time-driven workflow work
                // (SLA scan enqueues to the outbox; the drain below sends it).
                if (url.searchParams.get('sweep')) {
                    await scanSlaReminders().catch((err) => console.error('[WORKFLOW SLA] Unhandled scan error:', err));
                }
                const sent = await drainOutbox();
                if (sent > 0) console.log(`[OUTBOX WORKER] Drain processed ${sent} message(s).`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ processed: sent }));
            } catch (err) {
                console.error('[OUTBOX WORKER] Drain failed:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'drain failed' }));
            }
            return;
        }
        res.end('Worker is alive!'); // health check
    }).listen(PORT, () => {
        console.log(`[OUTBOX WORKER] Drain mode - listening on port ${PORT} (no poll loop).`);
    });
} else {
    // 1. OPEN THE PORT IMMEDIATELY (This satisfies Cloud Run instantly)
    http.createServer((req, res) => res.end('Worker is alive!')).listen(PORT, () => {
        console.log(`[OUTBOX WORKER] Listening for health checks on port ${PORT}`);
    });

    // 2. Start the outbox poller (loads env via platform/db).
    startWorker();

    // 3. Workflow SLA reminders: scan pending approval tasks past their reminder
    // time every 5 minutes (the scan enqueues to the outbox; the poller above
    // dispatches). Time-driven workflow work lives HERE, never in an API request.
    setInterval(() => scanSlaReminders().catch((err) => console.error('[WORKFLOW SLA] Unhandled scan error:', err)), 5 * 60 * 1000);
}
