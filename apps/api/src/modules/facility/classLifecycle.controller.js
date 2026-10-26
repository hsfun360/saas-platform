// Class cancellations and the waitlist (slice 5c, structures approved
// 2026-10-26). Thin HTTP layer over classLifecycle.service: the patron's
// cancellation under the class notice (a preview first, naming the bill
// outcome), joining the queue when a session or term is full, offering a
// freed seat, confirming an offer into an enrolment, withdrawing.

const lifecycle = require('./classLifecycle.service');
const { companyIdOf } = require('./facilityShared');

function send(res, out, okStatus = 200) {
    if (out && out.error) return res.status(out.status || 400).json({ message: out.error });
    return res.status(okStatus).json(out);
}

function guarded(label, work, okStatus = 200) {
    return async (req, res) => {
        try {
            const companyId = companyIdOf(req);
            if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
            send(res, await work(req, companyId), okStatus);
        } catch (error) {
            console.error(`Error ${label}:`, error);
            res.status(500).json({ message: 'Internal server error' });
        }
    };
}

// GET /api/facility/class-lifecycle/enrolments/:id/cancel-preview
exports.cancelPreview = guarded('previewing a class seat cancellation', (req, companyId) => lifecycle.cancelPreview(companyId, req.params.id));
// POST /api/facility/class-lifecycle/enrolments/:id/cancel { reason }
exports.cancelEnrolment = guarded('cancelling a class seat', (req) => lifecycle.cancelEnrolment(req, req.params.id, { reason: req.body.reason }));
// POST /api/facility/class-lifecycle/waitlist { classId, sessionId | scheduleId, memberNo | visitor, remarks }
exports.join = guarded('joining a class waitlist', (req) => lifecycle.join(req, req.body), 201);
// POST /api/facility/class-lifecycle/waitlist/:id/offer
exports.offer = guarded('offering a class seat', (req) => lifecycle.offer(req, req.params.id));
// POST /api/facility/class-lifecycle/waitlist/:id/confirm
exports.confirm = guarded('confirming a class waitlist offer', (req) => lifecycle.confirm(req, req.params.id), 201);
// POST /api/facility/class-lifecycle/waitlist/:id/withdraw { reason }
exports.withdraw = guarded('withdrawing from a class waitlist', (req) => lifecycle.withdraw(req, req.params.id, { reason: req.body.reason }));
