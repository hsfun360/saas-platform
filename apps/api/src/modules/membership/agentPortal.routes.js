// Sales Agent portal endpoints. Mounted BEFORE the staff auth wall in
// membership.routes.js (same reasoning as the member portal): registration is
// public (the signed invite token is the credential) and /me carries only
// verifyToken - an agent holds no staff workspace, so requireModule /
// requireMenuAction must not gate these.
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../platform/serviceContext');
const controller = require('./agentPortal.controller');
// Public endpoints: rate-limited (standing rule from platform/rateLimits.js)
// and shape-validated (platform/validate.js) before the controller runs.
const { tokenLimiter, signupLimiter } = require('../../platform/rateLimits');
const { validate } = require('../../platform/validate');
const schemas = require('./portal.schemas');

router.get('/register/context', tokenLimiter(), validate(schemas.registrationContext), controller.getRegistrationContext);
router.post('/register', signupLimiter(), validate(schemas.register), controller.register);
router.get('/me', verifyToken, controller.getMe);

module.exports = router;
