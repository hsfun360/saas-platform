// Memberships (the CRM screen) - SRS 2.3 Phase 1.
// Mounted at /api/membership/memberships behind verifyToken + requireModule +
// requireMenuAction('/membership/memberships') (see membership.routes.js).
// Member CRUD nests under the membership so ownership is always checked through
// the contract; the flat read-only search lives in members.routes.js.

const express = require('express');
const multer = require('multer');
const router = express.Router();
const controller = require('./membership.controller');

// Member photo uploads: in-memory (Cloud Run has no durable disk), 2 MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.get('/meta', controller.getMeta);
router.get('/options', controller.getOptions);
router.post('/photo', upload.single('photo'), controller.uploadMemberPhoto);
router.get('/', controller.listMemberships);
router.post('/', controller.createMembership);
router.get('/:id', controller.getMembership);
router.put('/:id', controller.updateMembership);

// Members under a membership.
router.get('/:id/members/suggest-no', controller.suggestMemberNo);
router.post('/:id/members', controller.createNominee);
router.post('/:id/members/:memberId/dependents', controller.createDependent);
router.put('/:id/members/:memberId', controller.updateMember);

module.exports = router;
