// Buggy Damages routes (mounted at /api/golf/buggy-damages behind
// requireMenuAction('/golf/buggy-damages') - see golf.routes.js): the damage
// register (no compensation in the system, user decision 2026-10-18).
const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const svc = require('./buggyMaintenance.service');
const s = require('./buggy.schemas');

function send(res, out, okStatus = 200) {
    if (out.error) return res.status(out.status || 400).json({ message: out.error });
    return res.status(okStatus).json(out);
}

router.get('/', validate(s.damageList), async (req, res) => {
    try { send(res, await svc.listDamages(req, req.query)); } catch (error) { console.error('Error listing buggy damages:', error); res.status(500).json({ message: 'Internal server error' }); }
});
router.post('/', validate(s.damageCreate), async (req, res) => {
    try { send(res, await svc.recordDamage(req, req.body), 201); } catch (error) { console.error('Error recording buggy damage:', error); res.status(500).json({ message: 'Internal server error' }); }
});
router.put('/:id', validate(s.damageUpdate), async (req, res) => {
    try { send(res, await svc.updateDamage(req, req.params.id, req.body)); } catch (error) { console.error('Error updating buggy damage:', error); res.status(500).json({ message: 'Internal server error' }); }
});
router.post('/:id/resolve', validate(s.id), async (req, res) => {
    try { send(res, await svc.resolveDamage(req, req.params.id)); } catch (error) { console.error('Error resolving buggy damage:', error); res.status(500).json({ message: 'Internal server error' }); }
});

module.exports = router;
