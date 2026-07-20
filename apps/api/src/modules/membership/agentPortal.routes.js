// Sales Agent portal endpoints. Mounted BEFORE the staff auth wall in
// membership.routes.js (same reasoning as the member portal): registration is
// public (the signed invite token is the credential) and /me carries only
// verifyToken - an agent holds no staff workspace, so requireModule /
// requireMenuAction must not gate these.
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../platform/serviceContext');
const controller = require('./agentPortal.controller');

router.get('/register/context', controller.getRegistrationContext);
router.post('/register', controller.register);
router.get('/me', verifyToken, controller.getMe);

module.exports = router;
