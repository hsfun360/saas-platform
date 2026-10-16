// Player Type master file. Mounted at /api/golf/player-types behind
// verifyToken + requireModule + requireMenuAction('/golf/player-types').
// Every route that reads a request part validates it at the boundary
// (platform/validate, schemas in playerType.schemas.js); /meta and the list
// read nothing and stay bare.
const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./playerType.controller');
const s = require('./playerType.schemas');

router.get('/meta', controller.getMeta);
router.get('/', controller.list);
router.post('/', validate(s.create), controller.create);
router.put('/:id', validate(s.update), controller.update);
router.patch('/:id', validate(s.setActive), controller.setActive);
router.delete('/:id', validate(s.remove), controller.remove);

module.exports = router;
