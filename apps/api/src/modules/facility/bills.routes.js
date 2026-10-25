const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./bill.controller');
const s = require('./bill.schemas');

// Mounted at /api/facility/bills behind requireMenuAction('/facility/bookings')
// (the bill is opened from the booking: POST /api/facility/bookings/:id/bill).
router.get('/:billId', validate(s.bill), controller.getBill);
router.post('/:billId/items', validate(s.addItem), controller.addItem);
router.put('/:billId/items/:itemId', validate(s.updateItem), controller.updateItem);
router.delete('/:billId/items/:itemId', validate(s.item), controller.removeItem);
router.post('/:billId/settle', validate(s.settle), controller.settle);
router.post('/:billId/void', validate(s.voidBill), controller.voidBill);

module.exports = router;
