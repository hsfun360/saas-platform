// Group / Tournament Booking routes (mounted at /api/golf/group-bookings
// behind requireMenuAction('/golf/group-bookings') - see golf.routes.js).
// Every route validates its request parts at the boundary (platform/validate,
// schemas in groupBooking.schemas.js - the standing rule, mounted 2026-10-12).
const express = require('express');
const { validate } = require('../../platform/validate');

const router = express.Router();
const controller = require('./groupBooking.controller');
const s = require('./groupBooking.schemas');

router.get('/meta', controller.getMeta);
router.get('/', validate(s.list), controller.list);
router.post('/', validate(s.create), controller.create);
router.get('/:id', validate(s.id), controller.get);
router.put('/:id', validate(s.update), controller.update);
router.post('/:id/cancel', validate(s.cancel), controller.cancel);

// --- Lifecycle (2026-10-11): submit for approval, recall, reopen, extend ---
router.get('/:id/submit-preview', validate(s.id), controller.submitPreview);
router.post('/:id/submit', validate(s.submit), controller.submit);
router.post('/:id/recall', validate(s.id), controller.recall);
router.post('/:id/reopen', validate(s.id), controller.reopen);
router.post('/:id/extend-deposit', validate(s.extendDeposit), controller.extendDeposit);

router.post('/:id/days', validate(s.addDay), controller.addDay);
router.put('/:id/days/:dayId', validate(s.updateDay), controller.updateDay);
router.delete('/:id/days/:dayId', validate(s.day), controller.removeDay);
router.get('/:id/days/:dayId/share', validate(s.day), controller.dayShare);
router.post('/:id/days/:dayId/waitlist', validate(s.day), controller.joinWaitlist);
router.delete('/:id/days/:dayId/waitlist', validate(s.day), controller.leaveWaitlist);
router.post('/:id/days/:dayId/flights/generate', validate(s.generateFlights), controller.generateFlights);
router.delete('/:id/days/:dayId/flights/:flightId', validate(s.flight), controller.removeFlight);
router.put('/:id/days/:dayId/draw', validate(s.draw), controller.draw);

router.post('/:id/players', validate(s.addPlayers), controller.addPlayers);
router.put('/:id/players/:playerId', validate(s.updatePlayer), controller.updatePlayer);
router.delete('/:id/players/:playerId', validate(s.player), controller.removePlayer);

// --- The folio (slice 2): group bill, proforma, deposits ---
const folio = require('./groupBill.controller');
router.get('/:id/folio', validate(s.id), folio.getFolio);
router.post('/:id/folio/items', validate(s.addItem), folio.addItem);
router.put('/:id/folio/items/:itemId', validate(s.updateItem), folio.updateItem);
router.delete('/:id/folio/items/:itemId', validate(s.item), folio.removeItem);
router.put('/:id/folio/proforma', validate(s.proformaTerms), folio.setProformaTerms);
router.post('/:id/folio/proforma/issue', validate(s.issueProforma), folio.issueProforma);
router.get('/:id/folio/proforma/html', validate(s.id), folio.proformaHtml);
router.post('/:id/folio/settle', validate(s.settle), folio.settleGroupBill);
router.post('/:id/folio/void', validate(s.voidBill), folio.voidGroupBill);
router.post('/:id/refunds', validate(s.requestRefund), folio.requestRefund);
router.post('/:id/refunds/:refundId/pay', validate(s.payRefund), folio.payRefund);
router.post('/:id/refunds/:refundId/decline', validate(s.declineRefund), folio.declineRefund);
router.post('/:id/deposits', validate(s.recordDeposit), folio.recordDeposit);
router.post('/:id/deposits/:billId/void', validate(s.voidDeposit), folio.voidDeposit);
router.get('/:id/deposits/:billId/html', validate(s.bill), folio.depositHtml);

module.exports = router;
