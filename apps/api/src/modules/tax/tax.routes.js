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

// Liveness probe - unauthenticated, so the gateway/monitoring can check the seam.
router.get('/health', (req, res) => res.json({ service: 'tax', status: 'ok' }));

// Everything below requires a valid token; handlers resolve the caller's account.
router.use(verifyToken);

// Option lists for the screen's dropdowns (and what the API validates against).
router.get('/meta', controller.getMeta);

// The countries the subscriber's companies operate in (for the Add-scheme picker).
router.get('/company-countries', controller.getCompanyCountries);

// The platform templates loadable for a country (for the Load-defaults preview/select).
router.get('/default-templates', controller.getDefaultTemplates);

// Copy the platform's selected templates for a country into the subscriber's catalog.
router.post('/load-defaults', controller.loadDefaults);

// Subscriber tax-scheme catalog (header) + effective-dated rate lines (detail).
router.get('/schemes', controller.listSchemes);
router.post('/schemes', controller.createScheme);
router.patch('/schemes/:id', controller.updateScheme);
router.post('/schemes/:id/rates', controller.addRate);
router.patch('/rates/:id', controller.updateRate);
router.delete('/rates/:id', controller.deleteRate);

// Per-company adoption of schemes (active workspace): enable/disable + GL overrides.
router.get('/company/schemes', companyController.getAdoption);
router.put('/company/schemes/:taxSchemeId', companyController.setAdoption);

module.exports = router;
