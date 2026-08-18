// Transaction Type - READ-ONLY membership view (the catalog moved to AR
// 2026-08-15; writes live on /api/ar/transaction-types). Mounted at
// /api/membership/transaction-types behind verifyToken + requireModule +
// requireMenuAction('/membership/transaction-types').

const express = require('express');
const router = express.Router();
const controller = require('./transactionType.controller');

router.get('/', controller.list);

// The old write endpoints are permanently gone - point callers at the AR master.
router.use((req, res) => res.status(410).json({
    message: 'The Transaction Type master moved to Account Receivable (/ar/transaction-types).',
}));

module.exports = router;
