const express = require('express');
const router = express.Router();
const controller = require('./membershipSetting.controller');
const { validate } = require('../../platform/validate');
const s = require('./membershipSetting.schemas');

// Club Specification (SRS 2.1.1). Mounted at /api/membership/settings.
// Auth + entitlement + menu RBAC applied by the parent router.
router.get('/', validate(s.get), controller.getSettings);
router.put('/', validate(s.updateSettings), controller.updateSettings);
router.put('/numbering', validate(s.updateNumbering), controller.updateNumbering);
// GET (draft in query params) so the action gate treats the live preview as a
// view - a read-only render must not demand an edit/create grant.
router.get('/numbering/preview', validate(s.previewNumbering), controller.previewNumbering);

module.exports = router;
