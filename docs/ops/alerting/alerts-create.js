// Creates the platform's alert policies in a project through the Cloud
// Monitoring REST API (the gcloud alpha/beta components are not installable on
// this machine). Idempotent by displayName: an existing policy with the same
// name is left alone. Usage: node alerts-create.js <project> <channelName> <token>
const [project, channel, token] = process.argv.slice(2);
if (!project || !channel || !token) { console.error('usage: node alerts-create.js <project> <channelName> <token>'); process.exit(1); }

const base = `https://monitoring.googleapis.com/v3/projects/${project}`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const DOC = (what) => ({
  content: `${what}\n\nRunbook: docs/ops/alerting.md in the saas-platform repo (thresholds, how to test, how to silence).`,
  mimeType: 'text/markdown',
});

const policies = [
  {
    displayName: 'Cloud Run 5xx error spike',
    documentation: DOC('A platform-* Cloud Run service answered more than 5 requests with a 5xx status within 5 minutes. Check the service logs (severity>=ERROR) for the revision named in the alert.'),
    combiner: 'OR',
    conditions: [{
      displayName: '5xx responses > 5 per 5 min, per service',
      conditionThreshold: {
        filter: 'resource.type = "cloud_run_revision" AND metric.type = "run.googleapis.com/request_count" AND metric.labels.response_code_class = "5xx"',
        aggregations: [{ alignmentPeriod: '300s', perSeriesAligner: 'ALIGN_SUM', crossSeriesReducer: 'REDUCE_SUM', groupByFields: ['resource.label.service_name'] }],
        comparison: 'COMPARISON_GT',
        thresholdValue: 5,
        duration: '0s',
        trigger: { count: 1 },
      },
    }],
    alertStrategy: { autoClose: '1800s' },
    notificationChannels: [channel],
    enabled: true,
  },
  {
    displayName: 'Login failure burst',
    documentation: DOC('platform-api refused more than 20 sign-in attempts (unknown email, wrong password or wrong MFA code) within 5 minutes - a credential-stuffing or brute-force signal. The per-IP backoff and rate limits are already slowing the caller; inspect the [AUTH] login failed lines for the IPs involved.'),
    combiner: 'OR',
    conditions: [{
      displayName: 'auth_login_failures > 20 per 5 min',
      conditionThreshold: {
        filter: 'resource.type = "cloud_run_revision" AND metric.type = "logging.googleapis.com/user/auth_login_failures"',
        aggregations: [{ alignmentPeriod: '300s', perSeriesAligner: 'ALIGN_SUM', crossSeriesReducer: 'REDUCE_SUM' }],
        comparison: 'COMPARISON_GT',
        thresholdValue: 20,
        duration: '0s',
        trigger: { count: 1 },
      },
    }],
    alertStrategy: { autoClose: '1800s' },
    notificationChannels: [channel],
    enabled: true,
  },
  {
    displayName: 'API boot or background job failure',
    documentation: DOC('platform-api failed to initialise its database at boot (the schema sync or a boot migration threw) or the outbox worker logged a failed scan, a poison message or a database error. The service may still be answering requests on old data - read the log line in the alert and the surrounding boot log.'),
    combiner: 'OR',
    conditions: [{
      displayName: 'Boot / worker failure log line',
      conditionMatchedLog: {
        filter: 'resource.type="cloud_run_revision" AND resource.labels.service_name=("platform-api" OR "platform-api-outboxworker") AND (textPayload:"Database initialization failed" OR textPayload:"[POISON MESSAGE]" OR textPayload:"[OUTBOX WORKER] Database error" OR textPayload:"[OUTBOX WORKER] Failed to start" OR textPayload:"scan failed" OR textPayload:"run processing failed" OR textPayload:"Unhandled")',
      },
    }],
    alertStrategy: { notificationRateLimit: { period: '3600s' }, autoClose: '1800s' },
    notificationChannels: [channel],
    enabled: true,
  },
  {
    displayName: 'Scheduler sweep failure',
    documentation: DOC('The Cloud Scheduler job that drains the outbox and runs the workflow SLA scan (outbox-sweep, every 5 minutes) reported an error. Emails and SLA reminders queue up until it succeeds again; check the worker service and the job\'s last run in Cloud Scheduler.'),
    combiner: 'OR',
    conditions: [{
      displayName: 'Cloud Scheduler job error',
      conditionMatchedLog: { filter: 'resource.type="cloud_scheduler_job" AND severity>=ERROR' },
    }],
    alertStrategy: { notificationRateLimit: { period: '3600s' }, autoClose: '1800s' },
    notificationChannels: [channel],
    enabled: true,
  },
];

(async () => {
  const existing = await fetch(`${base}/alertPolicies`, { headers }).then((r) => r.json());
  const have = new Map((existing.alertPolicies || []).map((p) => [p.displayName, p.name]));
  for (const p of policies) {
    if (have.has(p.displayName)) { console.log('exists ', p.displayName, have.get(p.displayName)); continue; }
    const res = await fetch(`${base}/alertPolicies`, { method: 'POST', headers, body: JSON.stringify(p) }).then((r) => r.json());
    if (res.error) console.log('ERROR  ', p.displayName, res.error.status, res.error.message.slice(0, 200));
    else console.log('created', p.displayName, res.name);
  }
})();
