const express = require('express');
const router = express.Router();
const controller = require('./membershipSetting.controller');

// Club Specification (SRS 2.1.1). Mounted at /api/membership/settings.
// Auth + entitlement + menu RBAC applied by the parent router.
router.get('/', controller.getSettings);
router.put('/', controller.updateSettings);
router.put('/numbering', controller.updateNumbering);
// GET (draft in query params) so the action gate treats the live preview as a
// view - a read-only render must not demand an edit/create grant.
router.get('/numbering/preview', controller.previewNumbering);

module.exports = router;
