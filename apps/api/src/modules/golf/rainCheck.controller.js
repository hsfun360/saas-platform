// Rain checks - the standalone listing (/golf/rain-checks) and the front-desk
// issue doors (mounted under /front-desk/registrations/:id, the Tee Time
// Sheet's menu). The service owns every rule.
const rainCheck = require('./rainCheck.service');

function send(res, out, okStatus = 200) {
    if (out.error) return res.status(out.status || 400).json({ message: out.error });
    return res.status(okStatus).json(out);
}

// POST /front-desk/registrations/:id/rain-check-preview { holesPlayed, amount? }
exports.preview = async (req, res) => {
    try {
        const out = await rainCheck.quote(req, req.params.id, req.body);
        if (out.error) return res.status(out.status || 400).json({ message: out.error });
        res.status(200).json(out.quote);
    } catch (error) {
        console.error('Error previewing rain check:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /front-desk/registrations/:id/rain-check { holesPlayed, amount?, reason }
exports.issue = async (req, res) => {
    try {
        send(res, await rainCheck.issue(req, req.params.id, req.body), 201);
    } catch (error) {
        console.error('Error issuing rain check:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /rain-checks?status&dateFrom&dateTo&golferId
exports.list = async (req, res) => {
    try {
        send(res, await rainCheck.list(req, req.query));
    } catch (error) {
        console.error('Error listing rain checks:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /rain-checks/:id
exports.get = async (req, res) => {
    try {
        send(res, await rainCheck.get(req, req.params.id));
    } catch (error) {
        console.error('Error loading rain check:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /rain-checks/:id/cancel { reason }
exports.cancel = async (req, res) => {
    try {
        send(res, await rainCheck.cancel(req, req.params.id, req.body));
    } catch (error) {
        console.error('Error cancelling rain check:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
