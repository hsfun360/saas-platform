// Caddy Rounds routes (mounted at /api/golf/caddy-rounds behind
// requireMenuAction('/golf/caddy-rounds') - see golf.routes.js): the
// rounds-of-service report the club settles caddy pay from.
const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const rounds = require('./caddyRounds.service');
const s = require('./caddy.schemas');

router.get('/', validate(s.rounds), async (req, res) => {
    try {
        const out = await rounds.report(req, req.query);
        if (out.error) return res.status(out.status || 400).json({ message: out.error });
        return res.status(200).json(out);
    } catch (error) {
        console.error('Error building the caddy rounds report:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
