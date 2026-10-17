// Buggy Station (Golf Management → Front Desk → Buggy Station; user decisions
// 2026-10-17) - the day's flights with their derived buggy slots, and the
// issue / return / swap doors. The service owns every rule.
const station = require('./buggyStation.service');

function send(res, out, okStatus = 200) {
    if (out.error) return res.status(out.status || 400).json({ message: out.error });
    return res.status(okStatus).json(out);
}

// GET /buggy-station/day?playDate=&courseId=
exports.day = async (req, res) => {
    try {
        send(res, await station.day(req, req.query));
    } catch (error) {
        console.error('Error loading buggy station day:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /buggy-station/available
exports.available = async (req, res) => {
    try {
        send(res, await station.available(req));
    } catch (error) {
        console.error('Error listing available buggies:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /buggy-station/resolve?code=
exports.resolve = async (req, res) => {
    try {
        send(res, await station.resolve(req, req.query));
    } catch (error) {
        console.error('Error resolving buggy code:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /buggy-station/issue
exports.issue = async (req, res) => {
    try {
        send(res, await station.issue(req, req.body), 201);
    } catch (error) {
        console.error('Error issuing buggy:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /buggy-station/return
exports.returnBuggy = async (req, res) => {
    try {
        send(res, await station.returnBuggy(req, req.body));
    } catch (error) {
        console.error('Error returning buggy:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /buggy-station/swap
exports.swap = async (req, res) => {
    try {
        send(res, await station.swap(req, req.body), 201);
    } catch (error) {
        console.error('Error swapping buggy:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
