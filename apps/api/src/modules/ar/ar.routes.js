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

// Liveness probe - unauthenticated, so the gateway/monitoring can check the seam.
router.get('/health', (req, res) => res.json({ service: 'ar', status: 'ok' }));

// Everything below requires a valid token and an entitled, active workspace.
// The Module row must be named EXACTLY 'Account Receivable' (Modules & Menus).
router.use(verifyToken);
router.use(requireModule('Account Receivable'));

// --- Debtor Listing (shared across membership / member / other debtors) ---
// Other Debtors are managed FROM this screen, so both mounts gate on its menu.
router.get('/debtors/meta', requireMenuAction('/ar/debtors'), debtorController.getMeta);
router.get('/debtors', requireMenuAction('/ar/debtors'), debtorController.listDebtors);
router.patch('/debtors/:id', requireMenuAction('/ar/debtors'), debtorController.updateDebtor);
router.get('/other-debtors/:id', requireMenuAction('/ar/debtors'), otherDebtorController.getOtherDebtor);
router.post('/other-debtors', requireMenuAction('/ar/debtors'), otherDebtorController.createOtherDebtor);
router.patch('/other-debtors/:id', requireMenuAction('/ar/debtors'), otherDebtorController.updateOtherDebtor);

// Not-yet-built areas of the service 501 rather than 404, so a caller can tell
// "wrong URL" from "planned but not implemented".
router.use((req, res) => res.status(501).json({ message: 'This part of Account Receivable is not implemented yet.' }));

module.exports = router;
