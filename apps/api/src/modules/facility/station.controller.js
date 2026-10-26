// Control Station (/facility/station; structures approved 2026-10-26, slice
// 3). Thin HTTP layer over station.service: the day's picture, check-in,
// entry with guests, sign-out, guests, issue, return, unit clear, end of day.

const station = require('./station.service');
const participantTypes = require('./participantType.service');
const { companyIdOf, DATE_RE } = require('./facilityShared');
const { getUserContext } = require('../../platform/serviceContext');
const { REGISTRATION_STATUSES, ISSUE_STATUSES, RETURN_CONDITIONS, UNIT_STATUSES, STATION_LIMITS } = require('./station.constants');

function send(res, out, okStatus = 200) {
    if (out && out.error) return res.status(out.status || 400).json({ message: out.error });
    return res.status(okStatus).json(out);
}

// GET /api/facility/station/meta
exports.meta = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const ptypes = await participantTypes.catalog(companyId, { activeOnly: true });
        res.status(200).json({
            participantTypes: participantTypes.asVocabulary(ptypes).filter((t) => t.baseIdentity !== 'member'),
            registrationStatuses: REGISTRATION_STATUSES,
            issueStatuses: ISSUE_STATUSES,
            returnConditions: RETURN_CONDITIONS,
            unitStatuses: UNIT_STATUSES,
            limits: STATION_LIMITS,
        });
    } catch (error) {
        console.error('Error loading station meta:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/facility/station/today?date
exports.today = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const { now } = await station.clock(companyId);
        const date = DATE_RE.test(String(req.query.date || '')) ? String(req.query.date) : now.date;
        res.status(200).json(await station.dayPicture(companyId, date, getUserContext(req).userId));
    } catch (error) {
        console.error('Error loading the station day:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/station/check-ins { bookingSlotId, droppedParticipantIds }
exports.checkIn = async (req, res) => {
    try {
        send(res, await station.checkIn(req, req.body), 201);
    } catch (error) {
        console.error('Error checking in a facility slot:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/station/registrations
exports.register = async (req, res) => {
    try {
        send(res, await station.register(req, req.body), 201);
    } catch (error) {
        console.error('Error registering a facility entry:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/station/registrations/:id/sign-out
exports.signOut = async (req, res) => {
    try {
        send(res, await station.signOut(req, req.params.id));
    } catch (error) {
        console.error('Error signing out a facility entry:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/facility/station/registrations/:id/guests
exports.saveGuests = async (req, res) => {
    try {
        send(res, await station.replaceGuests(req, req.params.id, req.body));
    } catch (error) {
        console.error('Error saving facility entry guests:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/station/issues
exports.issue = async (req, res) => {
    try {
        send(res, await station.issue(req, req.body), 201);
    } catch (error) {
        console.error('Error issuing a facility unit:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/station/issues/:id/return
exports.returnIssue = async (req, res) => {
    try {
        send(res, await station.returnIssue(req, req.params.id, req.body));
    } catch (error) {
        console.error('Error returning a facility issue:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/station/units/:id/clear
exports.clearUnit = async (req, res) => {
    try {
        send(res, await station.clearUnit(req, req.params.id));
    } catch (error) {
        console.error('Error clearing a facility unit:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/station/no-shows { slotIds }
exports.markNoShows = async (req, res) => {
    try {
        send(res, await station.markNoShows(req, req.body));
    } catch (error) {
        console.error('Error marking facility no-shows:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/station/end-of-day { facilityTypeId?, date }
exports.endOfDay = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const { now } = await station.clock(companyId);
        const date = DATE_RE.test(String(req.body.date || '')) ? String(req.body.date) : now.date;
        send(res, await station.endOfDay(req, { facilityTypeId: req.body.facilityTypeId ? String(req.body.facilityTypeId) : null, date }));
    } catch (error) {
        console.error('Error running the station end of day:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
