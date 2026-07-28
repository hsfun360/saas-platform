// src/platform/auditHooks.js
//
// GLOBAL Sequelize hooks that write the append-only audit trail
// (audit."AuditLog") for every create/update/delete on every model - current
// and future - with zero per-table wiring. Design approved 2026-07-28.
//
// Principles:
//   - FAIL-OPEN: an audit write must never break the business operation.
//   - ATOMICITY WITHOUT POISONING: when the change runs inside a transaction,
//     the audit row is written AFTER COMMIT (so rolled-back changes are never
//     logged, and an audit failure can never abort the transaction).
//   - REDACTION: secret-bearing fields are logged as "[REDACTED]".
//   - NOISE CONTROL: churn tables and churn fields are excluded, so the trail
//     stays a record of MEANINGFUL business changes.
//
// Known limitation (accepted): bulk operations without `individualHooks`
// (e.g. Model.update with a where clause) do not fire per-row hooks and are
// not logged. Convert call sites case-by-case if their trail matters.

const AuditLog = require('./auditLog.model');
const { currentAuditContext } = require('./auditContext');

// Tables that never enter the trail: queue/session churn + the trail itself.
const EXCLUDED_TABLES = new Set(['AuditLog', 'OutboxMessage', 'RefreshToken', 'SchemaMeta']);

// Fields whose changes are operational churn, not business changes. An update
// touching ONLY these fields writes nothing.
const NOISE_FIELDS = new Set([
    'updatedAt', 'createdAt',
    'failedLoginCount', 'lastFailedLoginAt', // every wrong password
    'lastWorkspaceId',                        // every login/switch
]);

// Secret-bearing fields: presence of a change is logged, the value never is.
const SENSITIVE_FIELDS = new Set([
    'password', 'mfaSecret', 'mfaRecoveryCodes',
    'resetPasswordToken', 'verificationToken',
    'smtpPassword', 'passwordEncrypted',
]);

const redact = (field, value) =>
    (value === null || value === undefined) ? value
        : SENSITIVE_FIELDS.has(field) ? '[REDACTED]' : value;

function buildChanges(action, instance) {
    const changes = {};
    if (action === 'update') {
        for (const field of instance.changed() || []) {
            if (NOISE_FIELDS.has(field)) continue;
            changes[field] = { from: redact(field, instance.previous(field)), to: redact(field, instance.get(field)) };
        }
    } else {
        const values = instance.get({ plain: true });
        for (const [field, value] of Object.entries(values)) {
            if (NOISE_FIELDS.has(field)) continue;
            if (value === null || value === undefined) continue;
            changes[field] = action === 'create'
                ? { from: null, to: redact(field, value) }
                : { from: redact(field, value), to: null };
        }
    }
    return changes;
}

function recordIdOf(instance) {
    const pk = instance.constructor.primaryKeyAttributes[0];
    return String(instance.get(pk)).slice(0, 64);
}

async function writeEntry(entry) {
    try {
        await AuditLog.create(entry);
    } catch (e) {
        console.error('[AUDIT] write failed (fail-open):', e.message);
    }
}

function makeHook(action) {
    return (instance, options) => {
        try {
            const table = instance.constructor.name;
            if (EXCLUDED_TABLES.has(table)) return;

            const changes = buildChanges(action, instance);
            if (Object.keys(changes).length === 0) return; // noise-only update

            const ctx = currentAuditContext();
            const entry = {
                happenedAt: new Date(),
                action,
                tableName: table,
                recordId: recordIdOf(instance),
                changes,
                userId: ctx ? ctx.userId : null,
                userEmail: ctx ? ctx.userEmail : null,
                companyId: ctx ? ctx.companyId : null,
                ip: ctx ? ctx.ip : null,
                requestId: ctx ? ctx.requestId : null,
            };

            // Inside a transaction: log only once it COMMITS (rolled-back work
            // never enters the trail; a failed audit write can't poison the tx).
            if (options && options.transaction) {
                options.transaction.afterCommit(() => writeEntry(entry));
            } else {
                writeEntry(entry); // fire-and-forget, fail-open
            }
        } catch (e) {
            console.error('[AUDIT] hook error (fail-open):', e.message);
        }
    };
}

// Call once at boot, after all models are loaded.
function registerAuditHooks(sequelize) {
    sequelize.addHook('afterCreate', makeHook('create'));
    sequelize.addHook('afterUpdate', makeHook('update'));
    sequelize.addHook('afterDestroy', makeHook('delete'));
    console.log('[AUDIT] global audit hooks registered.');
}

module.exports = { registerAuditHooks, EXCLUDED_TABLES, NOISE_FIELDS, SENSITIVE_FIELDS };
