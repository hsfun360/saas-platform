const express = require('express');
const router = express.Router();
const multer = require('multer');
const controller = require('./membershipTypeImport.controller');
const { validate } = require('../../platform/validate');
const s = require('./membershipTypeImport.schemas');

// Membership Type import (Excel -> staging -> selective migration).
// Mounted at /api/membership/type-imports; auth + entitlement + menu RBAC
// applied by the parent router. Uploads are in-memory (Cloud Run has no
// durable disk).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/template', validate(s.noInput), controller.downloadTemplate);
router.get('/', validate(s.noInput), controller.listBatches);
router.get('/:id', validate(s.id), controller.getBatch);
// validate runs AFTER multer: the file lives on req.file, the body it parses
// holds only the multipart text fields (none are read).
router.post('/', upload.single('file'), validate(s.upload), controller.uploadBatch);
router.post('/:id/migrate', validate(s.migrate), controller.migrateBatch);
router.delete('/:id', validate(s.id), controller.deleteBatch);

module.exports = router;
