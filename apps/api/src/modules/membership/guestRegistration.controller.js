// Guest Registration + Guest Visits (Membership Management; structure
// approved 2026-11-10). The services own every rule; this file maps their
// { error, status } results onto the unified JSON payload.
const registrations = require('./guestRegistration.service');
const guestVisits = require('./guestVisit.service');

function send(res, out, okStatus = 200) {
    if (out.error) return res.status(out.status || 400).json({ message: out.error });
    return res.status(okStatus).json(out);
}
function handler(name, fn, okStatus = 200) {
    return async (req, res) => {
        try {
            send(res, await fn(req), okStatus);
        } catch (error) {
            console.error(`Error ${name}:`, error);
            res.status(500).json({ message: 'Internal server error' });
        }
    };
}

exports.list = handler('listing guest registrations', (req) => registrations.list(req, req.query));
exports.host = handler('loading the host member', (req) => registrations.host(req, req.query));
exports.guests = handler('searching guests', (req) => registrations.searchGuests(req, req.query));
exports.get = handler('loading guest registration', (req) => registrations.get(req, req.params.id));
exports.create = handler('registering guest', (req) => registrations.create(req, req.body), 201);
exports.update = handler('updating guest registration', (req) => registrations.update(req, req.params.id, req.body));
exports.cancel = handler('cancelling guest registration', (req) => registrations.cancel(req, req.params.id, req.body));
exports.arrive = handler('marking guest arrival', (req) => registrations.arrive(req, req.params.id));
exports.pass = handler('loading guest pass', (req) => registrations.pass(req, req.params.id));
exports.sendPass = handler('sending guest pass', (req) => registrations.send(req, req.params.id, req.body));
exports.scan = handler('scanning guest pass', (req) => registrations.scan(req, req.body));

// PUBLIC: the pass page behind the token (no login).
exports.publicPass = handler('loading public guest pass', (req) => registrations.publicPass(req.params.token));

// Guest Visits enquiry (all modules, from the ledger).
exports.visits = handler('loading guest visits', (req) => guestVisits.report(req, req.query));
