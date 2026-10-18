// Buggy Maintenance routes (mounted at /api/golf/buggy-maintenance behind
// requireMenuAction('/golf/buggy-maintenance') - see golf.routes.js): the
// jobs on the fleet (service, repair, inspection). The service owns every rule.
const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const svc = require('./buggyMaintenance.service');
const s = require('./buggy.schemas');

function send(res, out, okStatus = 200) {
    if (out.error) return res.status(out.status || 400).json({ message: out.error });
    return res.status(okStatus).json(out);
}

router.get('/', validate(s.maintenanceList), async (req, res) => {
    try { send(res, await svc.list(req, req.query)); } catch (error) { console.error('Error listing buggy maintenance:', error); res.status(500).json({ message: 'Internal server error' }); }
});
router.post('/', validate(s.maintenanceOpen), async (req, res) => {
    try { send(res, await svc.open(req, req.body), 201); } catch (error) { console.error('Error opening buggy maintenance:', error); res.status(500).json({ message: 'Internal server error' }); }
});
router.post('/inspect', validate(s.maintenanceInspect), async (req, res) => {
    try { send(res, await svc.inspect(req, req.body), 201); } catch (error) { console.error('Error recording buggy inspection:', error); res.status(500).json({ message: 'Internal server error' }); }
});
router.post('/:id/complete', validate(s.maintenanceComplete), async (req, res) => {
    try { send(res, await svc.complete(req, req.params.id, req.body)); } catch (error) { console.error('Error completing buggy maintenance:', error); res.status(500).json({ message: 'Internal server error' }); }
});
router.delete('/:id', validate(s.id), async (req, res) => {
    try { send(res, await svc.cancel(req, req.params.id)); } catch (error) { console.error('Error cancelling buggy maintenance:', error); res.status(500).json({ message: 'Internal server error' }); }
});

module.exports = router;
