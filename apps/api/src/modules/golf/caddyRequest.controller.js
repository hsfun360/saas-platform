// Named-caddy requests - the handlers mounted on the Bookings router (keyed on
// a booking), the Front Desk router (keyed on a registered golfer) and the
// Caddy Station router (cancelled by the caddy). The service owns every rule.
const requests = require('./caddyRequest.service');

function send(res, out, okStatus = 200) {
    if (out.error) return res.status(out.status || 400).json({ message: out.error });
    return res.status(okStatus).json(out);
}

// POST /bookings/:id/caddy-requests { caddyId | caddyNo, playerId?, remarks? }
exports.createForBooking = async (req, res) => {
    try {
        send(res, await requests.create(req, { bookingProfileId: req.params.id, playerId: req.body.playerId || null, caddyId: req.body.caddyId || null, caddyNo: req.body.caddyNo || null, remarks: req.body.remarks, source: 'booking' }), 201);
    } catch (error) { console.error('Error requesting a caddy for a booking:', error); res.status(500).json({ message: 'Internal server error' }); }
};

// POST /front-desk/caddy-requests { playerId, caddyId | caddyNo, remarks? }
exports.createForPlayer = async (req, res) => {
    try {
        send(res, await requests.create(req, { playerId: req.body.playerId, caddyId: req.body.caddyId || null, caddyNo: req.body.caddyNo || null, remarks: req.body.remarks, source: 'desk' }), 201);
    } catch (error) { console.error('Error requesting a caddy at the desk:', error); res.status(500).json({ message: 'Internal server error' }); }
};

// POST .../caddy-requests/:requestId/cancel { reason? } - by the player (the desk).
exports.cancelByPlayer = async (req, res) => {
    try { send(res, await requests.cancel(req, req.params.requestId, { byCaddy: false, reason: req.body.reason })); } catch (error) { console.error('Error cancelling a caddy request:', error); res.status(500).json({ message: 'Internal server error' }); }
};

// POST /caddy-station/requests/:requestId/cancel-by-caddy { reason }
exports.cancelByCaddy = async (req, res) => {
    try { send(res, await requests.cancel(req, req.params.requestId, { byCaddy: true, reason: req.body.reason })); } catch (error) { console.error('Error cancelling a caddy request by the caddy:', error); res.status(500).json({ message: 'Internal server error' }); }
};

// GET .../caddy-request-candidates?playDate=
exports.candidates = async (req, res) => {
    try { send(res, await requests.candidates(req, req.query)); } catch (error) { console.error('Error listing caddy request candidates:', error); res.status(500).json({ message: 'Internal server error' }); }
};
