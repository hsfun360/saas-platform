// src/modules/tax/tax.routes.js
//
// Tax - shared financial reference consumed by every product (Membership /
// Facility / Golf). Reserves the `/api/tax` gateway seam.
//
// The scheme catalog is SUBSCRIBER-owned setup, not tied to any one product's
// subscription, so it needs no requireModule. It IS menu-gated (2026-10-12):
// the catalog routes on the Tax Setup menu ('/admin/tax-schemes'), the
// per-company adoption routes on the Company Tax menu ('/admin/company-tax'),
// and the reads both screens share on either. Hiding the screen was never the
// gate - any workspace user could write the catalog before this.

const express = require('express');
const router = express.Router();
const { verifyToken, requireMenuAction, requireAnyMenuAction } = require('../../platform/serviceContext');
const CATALOG_MENU = '/admin/tax-schemes';
const ADOPTION_MENU = '/admin/company-tax';
const EITHER = [CATALOG_MENU, ADOPTION_MENU];
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
router.get('/meta', requireAnyMenuAction(EITHER), controller.getMeta);

// The countries the subscriber's companies operate in (for the Add-scheme picker).
router.get('/company-countries', requireAnyMenuAction(EITHER), controller.getCompanyCountries);

// The platform templates loadable for a country (for the Load-defaults preview/select).
router.get('/default-templates', requireMenuAction(CATALOG_MENU), validate(s.defaultTemplates), controller.getDefaultTemplates);

// Copy the platform's selected templates for a country into the subscriber's catalog.
router.post('/load-defaults', requireMenuAction(CATALOG_MENU), validate(s.loadDefaults), controller.loadDefaults);

// Subscriber tax-scheme catalog (header) + effective-dated rate lines (detail).
router.get('/schemes', requireAnyMenuAction(EITHER), validate(s.listSchemes), controller.listSchemes);
router.post('/schemes', requireMenuAction(CATALOG_MENU), validate(s.createScheme), controller.createScheme);
router.patch('/schemes/:id', requireMenuAction(CATALOG_MENU), validate(s.updateScheme), controller.updateScheme);
router.post('/schemes/:id/rates', requireMenuAction(CATALOG_MENU), validate(s.addRate), controller.addRate);
router.patch('/rates/:id', requireMenuAction(CATALOG_MENU), validate(s.updateRate), controller.updateRate);
router.delete('/rates/:id', requireMenuAction(CATALOG_MENU), validate(s.id), controller.deleteRate);

// Per-company adoption of schemes (active workspace): enable/disable + GL overrides.
router.get('/company/schemes', requireMenuAction(ADOPTION_MENU), companyController.getAdoption);
router.put('/company/schemes/:taxSchemeId', requireMenuAction(ADOPTION_MENU), validate(s.setAdoption), companyController.setAdoption);

module.exports = router;
