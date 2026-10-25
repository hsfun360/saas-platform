// Patrons (/api/facility/patrons; structure approved 2026-10-25): the desk's
// search over the people the facility already knows (members booked before,
// visitors with a profile) and the visitor create. Members themselves are
// found through the Membership seam by member number (the booking context),
// so a member who never booked has no Patron row until the first booking.

const patrons = require('./patron.service');
const { companyIdOf, stampsFor } = require('./facilityShared');

// GET /api/facility/patrons?q=
exports.search = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        res.status(200).json({ patrons: await patrons.search(companyId, req.query.q) });
    } catch (error) {
        console.error('Error searching facility patrons:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/patrons - a visitor profile (found or created).
exports.createVisitor = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const stamps = await stampsFor(req);
        const r = await patrons.ensureOtherPatron(companyId, req.body, stamps);
        if (r.error) return res.status(400).json({ message: r.error });
        res.status(201).json({ message: 'Visitor saved.', patron: patrons.dto(r.patron, r.profile) });
    } catch (error) {
        console.error('Error creating facility visitor:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
