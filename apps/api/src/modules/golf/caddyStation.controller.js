// Caddy Station (Golf Management → Front Desk → Caddy Station; user decisions
// 2026-10-17) - the day's check-in queue, the flights with their derived caddy
// slots, and the assign / complete / swap doors. The service owns every rule.
const station = require('./caddyStation.service');

function send(res, out, okStatus = 200) {
    if (out.error) return res.status(out.status || 400).json({ message: out.error });
    return res.status(okStatus).json(out);
}

exports.day = async (req, res) => {
    try { send(res, await station.day(req, req.query)); } catch (error) { console.error('Error loading caddy station day:', error); res.status(500).json({ message: 'Internal server error' }); }
};

exports.resolve = async (req, res) => {
    try { send(res, await station.resolve(req, req.query)); } catch (error) { console.error('Error resolving caddy code:', error); res.status(500).json({ message: 'Internal server error' }); }
};

exports.checkIn = async (req, res) => {
    try { send(res, await station.checkIn(req, req.body), 201); } catch (error) { console.error('Error checking a caddy in:', error); res.status(500).json({ message: 'Internal server error' }); }
};

exports.checkOut = async (req, res) => {
    try { send(res, await station.checkOut(req, req.body)); } catch (error) { console.error('Error checking a caddy out:', error); res.status(500).json({ message: 'Internal server error' }); }
};

exports.assign = async (req, res) => {
    try { send(res, await station.assign(req, req.body), 201); } catch (error) { console.error('Error assigning a caddy:', error); res.status(500).json({ message: 'Internal server error' }); }
};

exports.complete = async (req, res) => {
    try { send(res, await station.complete(req, req.body)); } catch (error) { console.error('Error completing a caddy round:', error); res.status(500).json({ message: 'Internal server error' }); }
};

exports.swap = async (req, res) => {
    try { send(res, await station.swap(req, req.body), 201); } catch (error) { console.error('Error swapping a caddy:', error); res.status(500).json({ message: 'Internal server error' }); }
};
