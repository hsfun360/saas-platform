// outboxworker.js
//
// Thin bootstrap entry point for the outbox/notification worker (referenced by
// package.json `worker:outbox`). Opens the Cloud Run health-check port
// immediately, then delegates the polling/email logic to the notification module.

// 1. OPEN THE PORT IMMEDIATELY (This satisfies Cloud Run instantly)
const http = require('http');
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => res.end('Worker is alive!')).listen(PORT, () => {
    console.log(`[OUTBOX WORKER] Listening for health checks on port ${PORT}`);
});

// 2. Start the outbox poller (loads env via platform/db).
const { startWorker } = require('./src/modules/notification/notification.worker');

startWorker();

// 3. Workflow SLA reminders: scan pending approval tasks past their reminder
// time every 5 minutes (the scan enqueues to the outbox; the poller above
// dispatches). Time-driven workflow work lives HERE, never in an API request.
const { scanSlaReminders } = require('./src/modules/workflow/workflow.reminders');
setInterval(() => scanSlaReminders().catch((err) => console.error('[WORKFLOW SLA] Unhandled scan error:', err)), 5 * 60 * 1000);
