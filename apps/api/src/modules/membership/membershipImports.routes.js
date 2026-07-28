const express = require('express');
const router = express.Router();
const multer = require('multer');
const controller = require('./membershipImport.controller');

// Membership import (Excel -> staging -> selective migration).
// Mounted at /api/membership/imports; auth + entitlement + menu RBAC applied by
// the parent router. Uploads are in-memory (Cloud Run has no durable disk).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/template', controller.downloadTemplate);
router.get('/', controller.listBatches);
router.get('/:id', controller.getBatch);
router.post('/', upload.single('file'), controller.uploadBatch);
router.post('/:id/migrate', controller.migrateBatch);
router.delete('/:id', controller.deleteBatch);

module.exports = router;
