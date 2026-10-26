// Class enrolments, rosters, attendance and Hold (/facility/class-schedule;
// slice 5b, structures approved 2026-10-26). Thin HTTP layer over
// classEnrolment.service: enrol a member or a visitor into a session or a
// term (the seat billed on its own facility bill), the roster of a session,
// the attendance marks and the Hold with its preview.

const enrolment = require('./classEnrolment.service');
const { companyIdOf } = require('./facilityShared');

function send(res, out, okStatus = 200) {
    if (out && out.error) return res.status(out.status || 400).json({ message: out.error });
    return res.status(okStatus).json(out);
}

// POST /api/facility/class-enrolments { classId, sessionId | scheduleId, memberNo | visitor, remarks }
exports.enrol = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        send(res, await enrolment.enrol(req, req.body, { channel: 'desk' }), 201);
    } catch (error) {
        console.error('Error enrolling in a class:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/facility/class-sessions/:id/roster
exports.roster = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        send(res, await enrolment.roster(companyId, req.params.id));
    } catch (error) {
        console.error('Error loading a class roster:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/facility/class-sessions/:id/attendance { marks: [{ attendanceId, status }] }
exports.markAttendance = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        send(res, await enrolment.markAttendance(req, req.params.id, req.body.marks));
    } catch (error) {
        console.error('Error marking class attendance:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/class-sessions/:id/hold { confirm } - preview without confirm.
exports.hold = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        send(res, await enrolment.hold(req, req.params.id, { confirm: req.body.confirm === true }));
    } catch (error) {
        console.error('Error holding a class session:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
