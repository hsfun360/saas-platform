// src/modules/membership/memberPortal.routes.js
//
// Member Portal endpoints. Mounted BEFORE the staff auth wall in
// membership.routes.js: the register endpoints are public (the signed
// registration token IS the credential), and /me carries only verifyToken -
// a portal member has no workspace, so requireModule/requireMenuAction
// (staff/RBAC concerns) do not apply here.

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../platform/serviceContext');
const controller = require('./memberPortal.controller');
// Public endpoints: rate-limited (standing rule from platform/rateLimits.js)
// and shape-validated (platform/validate.js) before the controller runs.
const { tokenLimiter, signupLimiter } = require('../../platform/rateLimits');
const { validate } = require('../../platform/validate');
const schemas = require('./portal.schemas');

router.get('/register/context', tokenLimiter(), validate(schemas.registrationContext), controller.getRegistrationContext);
router.post('/register', signupLimiter(), validate(schemas.register), controller.register);
router.get('/me', verifyToken, controller.getMe);

module.exports = router;
