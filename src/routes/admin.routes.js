// src/routes/admin.routes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');

// Import your middlewares
const { verifyToken } = require('../middleware/auth.middleware'); // Adjust path to wherever your JWT verifier is
const { isSystemAdmin } = require('../middleware/rbac.middleware');

// Apply BOTH middlewares to all routes in this file
router.use(verifyToken);
router.use(isSystemAdmin);

// Now these routes are bulletproof
router.post('/roles', adminController.createRole);
router.get('/roles', adminController.getRoles);
router.post('/users', adminController.createUser);
router.post('/users/assign-role', adminController.assignUserToRole);

module.exports = router;