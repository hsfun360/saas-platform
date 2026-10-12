// src/modules/tax/tax.routes.js
//
// Tax - shared financial reference consumed by every product (Membership /
// Facility / Golf). Reserves the `/api/tax` gateway seam.
//
// The scheme catalog is SUBSCRIBER-owned setup, not tied to any one product's
// subscription, so it gates on a valid token only (verifyToken). Which roles can
// reach the setup screen is governed by the menu-permission system, as usual.

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../platform/serviceContext');
const controller = require('./tax.controller');
const companyController = require('./companyTaxScheme.controller');
const { validate } = require('../../platform/validate');
// Every route that reads a request part validates it at the boundary
// (platform/validate, schemas in tax.schemas.js - mounted 2026-10-12).
const s = require('./tax.schemas');

// Liveness probe - unauthenticated, so the gateway/monitoring can check the seam.
router.get('/health', (req, res) => res.json({ service: 'tax', status: 'ok' }));

// Everything below requires a valid token; handlers resolve the caller's account.
router.use(verifyToken);

// Option lists for the screen's dropdowns (and what the API validates against).
router.get('/meta', controller.getMeta);

// The countries the subscriber's companies operate in (for the Add-scheme picker).
router.get('/company-countries', controller.getCompanyCountries);

// The platform templates loadable for a country (for the Load-defaults preview/select).
router.get('/default-templates', validate(s.defaultTemplates), controller.getDefaultTemplates);

// Copy the platform's selected templates for a country into the subscriber's catalog.
router.post('/load-defaults', validate(s.loadDefaults), controller.loadDefaults);

// Subscriber tax-scheme catalog (header) + effective-dated rate lines (detail).
router.get('/schemes', validate(s.listSchemes), controller.listSchemes);
router.post('/schemes', validate(s.createScheme), controller.createScheme);
router.patch('/schemes/:id', validate(s.updateScheme), controller.updateScheme);
router.post('/schemes/:id/rates', validate(s.addRate), controller.addRate);
router.patch('/rates/:id', validate(s.updateRate), controller.updateRate);
router.delete('/rates/:id', validate(s.id), controller.deleteRate);

// Per-company adoption of schemes (active workspace): enable/disable + GL overrides.
router.get('/company/schemes', companyController.getAdoption);
router.put('/company/schemes/:taxSchemeId', validate(s.setAdoption), companyController.setAdoption);

module.exports = router;
