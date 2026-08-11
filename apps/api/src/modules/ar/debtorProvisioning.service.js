// src/modules/ar/debtorProvisioning.service.js
//
// AR-side consumer of 'DebtorProvisionRequested' outbox events. The producer
// (Membership, via platform/arGateway.js) sends EVENT-CARRIED STATE: everything
// needed to open the ledger account travels in the payload, so AR never reads
// membership tables (golden rule - reference by UUID, no cross-service reads).
//
// Idempotent + race-safe: the UNIQUE(companyId, debtorType, sourceId) index on
// Debtor means concurrent/replayed events converge on one row; an existing
// Debtor is NEVER updated by a provisioning event (Finance may have edited the
// terms on the AR screen since - AR owns them after first provisioning, per the
// credit-terms migration decision 2026-08-05).

const { sequelize } = require('../../platform/db');
const Debtor = require('./debtor.model');
const CreditAccount = require('./creditAccount.model');
const { DEBTOR_TYPE_KEYS } = require('./ar.constants');

// Coerce a payload money value to a non-negative 2dp string for DECIMAL(21,2).
function money(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return '0.00';
    return n.toFixed(2);
}

// Find-or-create the ledger account (Debtor + its CreditAccount pool row) for a
// provisioning payload:
//   { companyId, debtorType, sourceId, sourceNo?, name?, requestedBy?, terms?,
//     creditLimit?, sendReminders?, chargeInterest? }
// `sourceNo` + `name` stamp the Debtor's sort-key snapshots (debtorAccount /
// name); reconciliation and the listing read-repair fill/refresh them later if
// the payload arrived without them.
// Returns { debtor, created } - `created` false when the account already
// existed (replays stay silent). Throws on a malformed payload so the outbox
// retry/poison handling surfaces it.
function snap(value, max) {
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

async function provisionDebtor(payload, transaction = null) {
    const { companyId, debtorType, sourceId } = payload || {};
    if (!companyId || !sourceId || !DEBTOR_TYPE_KEYS.includes(debtorType)) {
        throw new Error(`DebtorProvisionRequested payload invalid: ${JSON.stringify(payload)}`);
    }

    const run = async (t) => {
        const [debtor, created] = await Debtor.findOrCreate({
            where: { companyId, debtorType, sourceId },
            defaults: {
                debtorAccount: snap(payload.sourceNo, 64),
                name: snap(payload.name, 255),
                terms: Number.isInteger(payload.terms) ? payload.terms : null,
                sendReminders: !!payload.sendReminders,
                chargeInterest: !!payload.chargeInterest,
                status: 'active',
            },
            transaction: t,
        });
        if (!created) {
            // Replays never overwrite AR-owned terms, but they DO fill missing
            // sort-key snapshots (nulls only, never replacing a value) - this
            // is what lets the idempotent backfill stamp ledger accounts that
            // predate the debtorAccount/name columns.
            const patch = {};
            if (!debtor.debtorAccount && snap(payload.sourceNo, 64)) patch.debtorAccount = snap(payload.sourceNo, 64);
            if (!debtor.name && snap(payload.name, 255)) patch.name = snap(payload.name, 255);
            if (Object.keys(patch).length) await debtor.update(patch, { transaction: t });
        }
        if (created) {
            // findOrCreate on CreditAccount too (not plain create): a crash
            // between the two inserts leaves a Debtor without a pool row, and
            // the outbox retry must repair it, not violate the unique index.
            await CreditAccount.findOrCreate({
                where: { debtorId: debtor.id },
                defaults: { companyId, creditLimit: money(payload.creditLimit), outstanding: 0 },
                transaction: t,
            });
        }
        return { debtor, created };
    };

    if (transaction) return run(transaction);
    return sequelize.transaction(run);
}

module.exports = { provisionDebtor };
