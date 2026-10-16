// Affiliated / Reciprocal Club master file. Mounted at
// /api/golf/affiliated-clubs behind verifyToken + requireModule +
// requireMenuAction('/golf/affiliated-clubs'). Every route that reads a
// request part validates it at the boundary (platform/validate, schemas in
// affiliatedClub.schemas.js); /meta and the list read nothing and stay bare.
const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./affiliatedClub.controller');
const s = require('./affiliatedClub.schemas');

router.get('/meta', controller.getMeta);
router.get('/', controller.list);
router.post('/', validate(s.create), controller.create);
router.put('/:id', validate(s.update), controller.update);
router.patch('/:id', validate(s.setActive), controller.setActive);
router.delete('/:id', validate(s.remove), controller.remove);

module.exports = router;
