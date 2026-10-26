const express = require('express');
const { z, fields } = require('../../platform/validate');
const { validate } = require('../../platform/validate');
const charges = require('./noShowCharge.controller');
const suspensions = require('./suspension.controller');

const str = (max = 255) => z.string().max(max).nullable().optional();
const idParam = { params: z.object({ id: fields.uuid }) };

// Mounted at /api/facility/no-show-charges behind requireMenuAction('/facility/no-show-charges').
const chargesRouter = express.Router();
chargesRouter.get('/', validate({ query: z.object({ status: str(20), from: str(10), to: str(10), q: str(100) }) }), charges.list);
chargesRouter.post('/:id/post', validate(idParam), charges.post);
chargesRouter.post('/:id/waive', validate({ ...idParam, body: z.object({ reason: str(255), clearStrike: z.boolean().optional() }) }), charges.waive);
chargesRouter.post('/:id/reprice', validate(idParam), charges.reprice);

// Mounted at /api/facility/suspensions behind requireMenuAction('/facility/suspensions').
const suspensionsRouter = express.Router();
suspensionsRouter.get('/', validate({ query: z.object({ status: str(10) }) }), suspensions.list);
suspensionsRouter.post('/', validate({ body: z.object({ memberNo: z.string().max(50), fromDate: z.string().max(10), toDate: z.string().max(10), reason: str(255), facilityTypeId: str(64) }) }), suspensions.create);
suspensionsRouter.post('/:id/lift', validate({ ...idParam, body: z.object({ reason: str(255) }) }), suspensions.lift);

module.exports = { chargesRouter, suspensionsRouter };
