// src/platform/numberingController.js
//
// Shared Numbering Control endpoint factory. Each owning module mounts one
// instance over ITS OWN NumberingScheme table with ITS OWN purpose list, so
// the maintenance screens split per module (/membership/numbering,
// /ar/numbering) while the validation/preview/DTO logic stays one copy.
// Auth/entitlement/menu gating is applied by the mounting router.

const express = require('express');

// Build a router serving: GET /meta, GET /, POST /, PATCH /:id, POST /preview.
// `model` = the module's NumberingScheme; `purposes` = the [{key,label}] list
// this screen offers (and validates against).
function makeNumberingRouter({ model, purposes }) {
    const { previewNext } = require('../modules/saas/numberingGenerator');
    const { normalizeConfig } = require('../modules/saas/numberingScheme.service');
    const {
        NUMBERING_MODES,
        RESET_RULES,
        FORMAT_TOKENS,
        RESET_RULE_KEYS,
    } = require('../modules/saas/numberingScheme.constants');
    const purposeKeys = purposes.map((p) => p.key);
    const router = express.Router();

    const companyIdOf = (req) => (req.user && req.user.companyId ? req.user.companyId : null);

    const toDto = (row) => ({
        id: row.id,
        companyId: row.companyId,
        purpose: row.purpose,
        mode: row.mode,
        prefix: row.prefix,
        format: row.format,
        seqPadLength: row.seqPadLength,
        startingNumber: row.startingNumber,
        currentNumber: row.currentNumber,
        resetRule: row.resetRule,
        currentPeriod: row.currentPeriod,
        isActive: row.isActive,
        nextPreview: row.mode === 'auto' ? previewNext(row).number : null,
    });

    router.get('/meta', (req, res) => {
        res.status(200).json({
            modes: NUMBERING_MODES,
            resetRules: RESET_RULES,
            purposes,
            tokens: FORMAT_TOKENS,
        });
    });

    router.get('/', async (req, res) => {
        try {
            const companyId = companyIdOf(req);
            if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
            const rows = await model.findAll({ where: { companyId }, order: [['purpose', 'ASC']] });
            res.status(200).json(rows.map(toDto));
        } catch (error) {
            console.error('Error listing numbering schemes:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.post('/', async (req, res) => {
        try {
            const companyId = companyIdOf(req);
            if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

            const parsed = normalizeConfig(req.body);
            if (parsed.error) return res.status(400).json({ message: parsed.error });
            const purpose = String(req.body.purpose || '').trim();
            if (!purposeKeys.includes(purpose)) return res.status(400).json({ message: 'Invalid numbering purpose.' });

            const existing = await model.findOne({ where: { companyId, purpose } });
            if (existing) return res.status(409).json({ message: 'A numbering scheme for this purpose already exists.' });

            const row = await model.create({ companyId, purpose, ...parsed.value });
            res.status(201).json({ message: 'Numbering scheme created.', scheme: toDto(row) });
        } catch (error) {
            console.error('Error creating numbering scheme:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // Draft preview (unsaved config) - registered before /:id so the path wins.
    router.post('/preview', (req, res) => {
        try {
            const draft = {
                prefix: typeof req.body.prefix === 'string' ? req.body.prefix : '',
                format: typeof req.body.format === 'string' && req.body.format.trim() ? req.body.format : '{PREFIX}{SEQ}',
                seqPadLength: Number.isInteger(Number(req.body.seqPadLength)) ? Number(req.body.seqPadLength) : 5,
                startingNumber: Number.isInteger(Number(req.body.startingNumber)) ? Number(req.body.startingNumber) : 1,
                currentNumber: Number.isInteger(Number(req.body.currentNumber)) ? Number(req.body.currentNumber) : 0,
                resetRule: RESET_RULE_KEYS.includes(req.body.resetRule) ? req.body.resetRule : 'never',
                currentPeriod: null,
            };
            const typeCode = typeof req.body.typeCode === 'string' ? req.body.typeCode : undefined;
            res.status(200).json(previewNext(draft, { typeCode }));
        } catch (error) {
            console.error('Error previewing numbering scheme:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // Config fields only - never the counter or the purpose.
    router.patch('/:id', async (req, res) => {
        try {
            const companyId = companyIdOf(req);
            if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

            const row = await model.findOne({ where: { id: req.params.id, companyId } });
            if (!row) return res.status(404).json({ message: 'Numbering scheme not found.' });

            const parsed = normalizeConfig(req.body);
            if (parsed.error) return res.status(400).json({ message: parsed.error });

            Object.assign(row, parsed.value);
            await row.save();
            res.status(200).json({ message: 'Numbering scheme updated.', scheme: toDto(row) });
        } catch (error) {
            console.error('Error updating numbering scheme:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    return router;
}

module.exports = { makeNumberingRouter };
