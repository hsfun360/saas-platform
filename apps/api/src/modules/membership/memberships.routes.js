// Memberships (the CRM screen) - SRS 2.3 Phase 1.
// Mounted at /api/membership/memberships behind verifyToken + requireModule +
// requireMenuAction('/membership/memberships') (see membership.routes.js).
// Member CRUD nests under the membership so ownership is always checked through
// the contract; the flat read-only search lives in members.routes.js.

const express = require('express');
const multer = require('multer');
const router = express.Router();
const controller = require('./membership.controller');
// Every route that reads a request part validates it at the boundary
// (platform/validate, schemas in membership.schemas.js - the standing rule).
const { validate } = require('../../platform/validate');
const s = require('./membership.schemas');

// Member photo uploads: in-memory (Cloud Run has no durable disk), 2 MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.get('/meta', controller.getMeta);
router.get('/options', controller.getOptions);
// Multipart: the handler reads req.file only (no params/query/body), so
// there is nothing for the Zod seam to bound here.
router.post('/photo', upload.single('photo'), controller.uploadMemberPhoto);
router.get('/', validate(s.list), controller.listMemberships);
router.post('/', validate(s.create), controller.createMembership);
router.get('/:id', validate(s.id), controller.getMembership);
router.put('/:id', validate(s.update), controller.updateMembership);
// Live AR credit standing (ownership split 2026-09-27): the pool the credit
// gate enforces, shown beside the membership-maintained limit.
router.get('/:id/ar-credit', validate(s.arCredit), controller.getArCredit);

// Members under a membership.
router.get('/:id/members/suggest-no', validate(s.suggestMemberNo), controller.suggestMemberNo);
router.post('/:id/members', validate(s.createNominee), controller.createNominee);
router.post('/:id/members/:memberId/dependents', validate(s.createDependent), controller.createDependent);
router.put('/:id/members/:memberId', validate(s.updateMember), controller.updateMember);

module.exports = router;
