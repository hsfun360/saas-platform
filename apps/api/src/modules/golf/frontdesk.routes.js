// Golf Front Desk routes (mounted at /api/golf/front-desk behind
// requireMenuAction('/golf/tee-time-sheet') - the Tee Time Sheet menu, see
// golf.routes.js).
const express = require('express');

const router = express.Router();
const controller = require('./frontdesk.controller');

router.get('/day', controller.getDay);
router.get('/meta', controller.getMeta);
router.post('/registrations', controller.register);
router.post('/register-flight', controller.registerFlight);
router.post('/registrations/:id/cancel', controller.cancelRegistration);
router.get('/no-shows', controller.getNoShows);
router.post('/no-shows', controller.confirmNoShows);
router.post('/registrations/:id/bills', controller.openBill);
router.get('/bills/:billId', controller.getBill);
router.post('/bills/:billId/items', controller.addItem);
router.put('/bills/:billId/items/:itemId', controller.updateItem);
router.delete('/bills/:billId/items/:itemId', controller.removeItem);
router.post('/bills/:billId/settle', controller.settleBill);
router.post('/bills/:billId/void', controller.voidBill);

module.exports = router;
