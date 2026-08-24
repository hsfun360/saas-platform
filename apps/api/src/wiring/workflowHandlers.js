// src/wiring/workflowHandlers.js
//
// COMPOSITION-TIME registration of workflow completion handlers: the one place
// where a producing module's "what happens when the approval finishes" code is
// hooked onto its purpose. Required once from app.js.
//
// Rules for a handler (2026-07-22 execution-flow agreement):
//   - It runs INSIDE the completing request's transaction: flip the document's
//     status and nothing else heavy.
//   - Anything slow or fan-out (invoices, email chains, provisioning) must be
//     enqueued to the outbox from the handler, never executed inline.
//
// A purpose may exist in workflow.constants without a handler here - the chain
// then runs and records its outcome, and the producing module wires its side
// later (that is where 'membership-application' stands today: the Membership
// submit flow is not routed through the gateway yet).

const purposeRegistry = require('../modules/workflow/purposeRegistry');

// --- AR draft lifecycle documents (invoice 2026-08-13, credit-note
// 2026-08-20) ---------------------------------------------------------------
// Submit routed the draft to 'pending-approval'; the outcome lands here.
//   approved  -> post the draft (number issued now, balance effects applied;
//                a CN then resolves its stored allocation intent)
//   rejected  -> back to 'draft' ("Open") so the submitter can amend/resubmit
//   cancelled -> back to 'draft' (submitter recalled it)
// Posting is small (one row + counter updates under the pool lock), so it
// stays inside the completing transaction per the execution-flow agreement.
function registerArLedgerPurpose(purpose, docKind, synthPrefix) {
    purposeRegistry.register(purpose, {
        onApproved: async ({ entityId, instance, transaction }) => {
            const Ledger = require('../modules/ar/ledger.model');
            const Debtor = require('../modules/ar/debtor.model');
            const posting = require('../modules/ar/arPosting.service');
            const numberingGateway = require('../platform/numberingGateway');

            const row = await Ledger.findOne({
                where: { id: entityId, companyId: instance.companyId, docKind, status: 'pending-approval' },
                transaction,
            });
            if (!row) return; // already handled / voided out-of-band - never fail the approval
            const debtor = await Debtor.findOne({ where: { id: row.debtorId, companyId: instance.companyId }, transaction });
            if (!debtor) return;

            await posting.postDraftLedger({
                companyId: instance.companyId,
                debtor,
                row,
                issueDocNo: async (t) => {
                    const issued = await numberingGateway.issueNumberForCompany(instance.companyId, purpose, { transaction: t });
                    if (issued && issued.number) return issued.number;
                    return `${synthPrefix}-${Date.now().toString(36).toUpperCase()}`;
                },
                stamps: { updatedBy: instance.submitterUserId || null },
                t: transaction,
            });
        },
        onRejected: async ({ entityId, instance, transaction }) => {
            const Ledger = require('../modules/ar/ledger.model');
            const [n] = await Ledger.update(
                { status: 'draft' },
                { where: { id: entityId, companyId: instance.companyId, docKind, status: 'pending-approval' }, transaction },
            );
            // Keep the tax-breakdown status mirror in step (ar.TaxLedger).
            if (n) await require('../modules/ar/taxLedger.service').syncStatus({ docType: docKind, docId: entityId, status: 'draft', t: transaction });
        },
        onCancelled: async ({ entityId, instance, transaction }) => {
            const Ledger = require('../modules/ar/ledger.model');
            const [n] = await Ledger.update(
                { status: 'draft' },
                { where: { id: entityId, companyId: instance.companyId, docKind, status: 'pending-approval' }, transaction },
            );
            if (n) await require('../modules/ar/taxLedger.service').syncStatus({ docType: docKind, docId: entityId, status: 'draft', t: transaction });
        },
    });
}
registerArLedgerPurpose('ar-invoice', 'invoice', 'INV');
registerArLedgerPurpose('ar-credit-note', 'credit-note', 'CN');

module.exports = {};
