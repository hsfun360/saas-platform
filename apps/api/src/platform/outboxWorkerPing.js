// src/platform/outboxWorkerPing.js
//
// Best-effort wake-up ping to the outbox worker's /drain endpoint, so emails go
// out seconds after they are enqueued WITHOUT the worker running an always-on
// poll loop (Cloud Run bills an always-on instance 24/7). Delivery does NOT
// depend on this ping: the outbox table remains the source of truth and a
// Cloud Scheduler sweep drains it periodically, so a lost ping only delays a
// message until the next sweep. That is why every failure here is swallowed.
//
// Config: OUTBOX_WORKER_URL = the worker service's root URL. Unset (local dev,
// poll-mode environments) makes the ping a no-op. The worker service requires
// IAM-authenticated invocations, so the ping carries an OIDC identity token
// fetched from the Cloud Run metadata server (audience = the worker URL).

const axios = require('axios');

const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';

// Identity tokens live ~1h; cache per audience and refresh well before expiry.
const tokenCache = new Map(); // audience -> { token, fetchedAt }
const TOKEN_TTL_MS = 45 * 60 * 1000;

async function identityToken(audience) {
    const cached = tokenCache.get(audience);
    if (cached && Date.now() - cached.fetchedAt < TOKEN_TTL_MS) return cached.token;
    const res = await axios.get(METADATA_TOKEN_URL, {
        params: { audience },
        headers: { 'Metadata-Flavor': 'Google' },
        timeout: 2000,
    });
    tokenCache.set(audience, { token: res.data, fetchedAt: Date.now() });
    return res.data;
}

// Fire the actual HTTP ping. Never throws.
async function fireDrainPing() {
    const workerUrl = process.env.OUTBOX_WORKER_URL;
    if (!workerUrl) return;
    try {
        const token = await identityToken(workerUrl);
        await axios.post(`${workerUrl.replace(/\/$/, '')}/drain`, null, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 30000,
        });
    } catch (err) {
        // Best-effort by design: the scheduler sweep is the delivery guarantee.
        console.warn('[OUTBOX PING] drain ping failed (sweep will pick it up):', err.message);
    }
}

// Ping the worker about new outbox work. When called inside a transaction the
// ping is deferred to AFTER COMMIT (pinging earlier would let the worker look
// before the row is visible); without one it fires immediately. Fire-and-forget
// either way - callers never await delivery.
function pingOutboxWorker(transaction = null) {
    if (!process.env.OUTBOX_WORKER_URL) return;
    if (transaction && typeof transaction.afterCommit === 'function') {
        transaction.afterCommit(() => { fireDrainPing(); });
    } else {
        fireDrainPing();
    }
}

module.exports = { pingOutboxWorker };
