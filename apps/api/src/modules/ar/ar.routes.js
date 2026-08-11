// src/modules/ar/ar.routes.js
//
// Account Receivable - the open-item debtor ledger every product posts into.
// Reserves the `/api/ar` gateway seam and wires the standard contract:
// verify JWT (who) + require the module subscription (entitlement) + per-screen
// menu-action RBAC. Spec: docs/systems/account-receivable.md
//
// Slice 1: Debtor Listing + ledger-account maintenance + Other Debtor party
// master. The document ledger (Invoice/DN/CN, receipts, deposits, allocation)
// lands in the next slice.

const express = require('express');
const router = express.Router();
const { verifyToken, requireModule, requireMenuAction } = require('../../platform/serviceContext');
const debtorController = require('./debtor.controller');
const otherDebtorController = require('./otherDebtor.controller');
const documentController = require('./arDocument.controller');
const periodicController = require('./arPeriodic.controller');

// Liveness probe - unauthenticated, so the gateway/monitoring can check the seam.
router.get('/health', (req, res) => res.json({ service: 'ar', status: 'ok' }));

// Everything below requires a valid token and an entitled, active workspace.
// The Module row must be named EXACTLY 'Account Receivable' (Modules & Menus).
router.use(verifyToken);
router.use(requireModule('Account Receivable'));

// --- Debtor Listing (shared across membership / member / other debtors) ---
// Other Debtors are managed FROM this screen, so both mounts gate on its menu.
router.get('/debtors/meta', requireMenuAction('/ar/debtors'), debtorController.getMeta);
router.post('/reconcile', requireMenuAction('/ar/debtors'), debtorController.reconcile);
router.get('/debtors', requireMenuAction('/ar/debtors'), debtorController.listDebtors);
router.patch('/debtors/:id', requireMenuAction('/ar/debtors'), debtorController.updateDebtor);
router.get('/other-debtors/:id', requireMenuAction('/ar/debtors'), otherDebtorController.getOtherDebtor);
router.post('/other-debtors', requireMenuAction('/ar/debtors'), otherDebtorController.createOtherDebtor);
router.patch('/other-debtors/:id', requireMenuAction('/ar/debtors'), otherDebtorController.updateOtherDebtor);

// --- Debtor account (documents + entry + void) - the listing's detail
// surface, same menu. POST maps to the menu's Create action, void PATCHes to
// Edit, per the standard method->action mapping.
router.get('/debtors/:id/account', requireMenuAction('/ar/debtors'), documentController.getAccount);
router.get('/debtors/:id/account/meta', requireMenuAction('/ar/debtors'), documentController.getAccountMeta);
router.get('/documents/:type/:id/allocations', requireMenuAction('/ar/debtors'), documentController.getAllocations);
router.post('/debtors/:id/ledger', requireMenuAction('/ar/debtors'), documentController.postLedger);
router.post('/debtors/:id/receipts', requireMenuAction('/ar/debtors'), documentController.postReceipt);
router.post('/debtors/:id/refunds', requireMenuAction('/ar/debtors'), documentController.postRefund);
router.post('/debtors/:id/deposits', requireMenuAction('/ar/debtors'), documentController.postDeposit);
router.post('/deposits/:id/convert', requireMenuAction('/ar/debtors'), documentController.convertDeposit);
router.patch('/ledger/:id/void', requireMenuAction('/ar/debtors'), documentController.voidLedger);
router.patch('/receipts/:id/void', requireMenuAction('/ar/debtors'), documentController.voidReceipt);
router.patch('/deposits/:id/void', requireMenuAction('/ar/debtors'), documentController.voidDeposit);

// --- Numbering Control (AR-owned document series; split per module 2026-08-05) ---
const { makeNumberingRouter } = require('../../platform/numberingController');
router.use(
    '/numbering-schemes',
    requireMenuAction('/ar/numbering'),
    makeNumberingRouter({
        model: require('./numberingScheme.model'),
        purposes: require('../../modules/saas/numberingScheme.constants').AR_NUMBERING_PURPOSES,
    }),
);

// --- Interest run (its own screen/menu: /ar/interest) ---
router.get('/interest-generations', requireMenuAction('/ar/interest'), periodicController.list);
router.post('/interest-generations', requireMenuAction('/ar/interest'), periodicController.generate);
router.get('/interest-generations/:id', requireMenuAction('/ar/interest'), periodicController.get);
router.post('/interest-generations/confirm', requireMenuAction('/ar/interest'), periodicController.confirm);
router.post('/interest-generations/:id/cancel', requireMenuAction('/ar/interest'), periodicController.cancel);

// --- AR Specification (its own screen/menu: /ar/settings) ---
// The per-company AR options singleton (statement cutoff day + aging
// boundaries). Reads are shared with Statement Generation (its date auto-fill
// needs the cutoff), writes belong to the Specification screen alone.
const { requireAnyMenuAction } = require('../../platform/serviceContext');
router.get('/settings', requireAnyMenuAction(['/ar/settings', '/ar/statement-generation']), periodicController.getArSetting);
router.put('/settings', requireMenuAction('/ar/settings'), periodicController.saveArSetting);
// Saved layout options rendered on a dummy statement (screen preview).
router.get('/settings/statement-preview', requireMenuAction('/ar/settings'), periodicController.getStatementLayoutPreview);

// --- Statement Generation (its own screen/menu: /ar/statement-generation) ---
// Runs are BACKGROUND jobs: submit queues the run for the outbox worker; the
// screen polls the run row for progress and can cancel/resume any time.
router.post('/statement-runs/preview', requireMenuAction('/ar/statement-generation'), periodicController.previewStatementRun);
router.post('/statement-runs', requireMenuAction('/ar/statement-generation'), periodicController.createStatementRun);
router.get('/statement-runs/:id', requireMenuAction('/ar/statement-generation'), periodicController.getStatementRun);
router.post('/statement-runs/:id/resume', requireMenuAction('/ar/statement-generation'), periodicController.resumeStatementRun);
router.post('/statement-runs/:id/cancel', requireMenuAction('/ar/statement-generation'), periodicController.cancelStatementRun);
router.get('/statement-runs', requireMenuAction('/ar/statement-generation'), periodicController.listStatementRuns);

// --- Statement Listing (its own screen/menu: /ar/statements) ---
router.get('/statements', requireMenuAction('/ar/statements'), periodicController.listStatements);
router.get('/statements/:id', requireMenuAction('/ar/statements'), periodicController.getStatement);
router.get('/statements/:id/pdf', requireMenuAction('/ar/statements'), periodicController.getStatementPdf);
router.patch('/statements/:id/void', requireMenuAction('/ar/statements'), periodicController.voidStatement);

// Not-yet-built areas of the service 501 rather than 404, so a caller can tell
// "wrong URL" from "planned but not implemented".
router.use((req, res) => res.status(501).json({ message: 'This part of Account Receivable is not implemented yet.' }));

module.exports = router;
