// Facility classes - the PURE enrolment and attendance rules (slice 5b,
// structures approved 2026-10-26): no DB, unit-tested. The seats a session
// holds count its live attendance rows; the fee item follows the audience;
// Hold marks the unmarked rows no-show; an enrolment completes once every
// one of its rows is final.

const LIVE_ATTENDANCE = ['enrolled', 'attended', 'no-show', 'excused'];
const FINAL_ATTENDANCE = ['attended', 'no-show', 'excused', 'cancelled'];
const MARKS = ['enrolled', 'attended', 'no-show', 'excused'];

// Live rows of a session (anything not cancelled) - the seats taken.
function seatsTaken(rows) {
    return (rows || []).filter((r) => LIVE_ATTENDANCE.includes(r.status)).length;
}

// Refuse when the arriving seats do not fit; null when they do.
function capacityVerdict({ taken, arriving = 1, capacity, label }) {
    if (capacity == null) return null;
    if (taken + arriving > Number(capacity)) {
        return taken >= Number(capacity)
            ? `${label} is full - ${taken} of ${capacity} seats taken.`
            : `${label} has ${Number(capacity) - taken} seat${Number(capacity) - taken === 1 ? '' : 's'} left - ${arriving} arriving.`;
    }
    return null;
}

// The sessions a term enrolment materialises: scheduled, on or after today.
function remainingSessions(sessions, today) {
    return (sessions || []).filter((s) => s.status === 'scheduled' && String(s.sessionDate) >= today);
}

// The fee item for an audience: the visitor item when the patron is a visitor
// and the class names one, else the member item; null = free.
function feeItemIdFor(cls, patronType) {
    if (patronType === 'other' && cls.visitorFeeTransactionTypeId) return cls.visitorFeeTransactionTypeId;
    return cls.feeTransactionTypeId || null;
}

// The rows Hold marks no-show: still 'enrolled' (unmarked).
function holdTargets(rows) {
    return (rows || []).filter((r) => r.status === 'enrolled');
}

// An enrolment is completed once every attendance row is final.
function enrolmentStatusAfter(rows, current = 'enrolled') {
    if (current === 'cancelled') return 'cancelled';
    const live = (rows || []).filter((r) => r.status !== 'cancelled');
    if (!live.length) return current;
    return live.every((r) => FINAL_ATTENDANCE.includes(r.status)) ? 'completed' : 'enrolled';
}

// A mark the desk may set on a row of a scheduled session.
function validMark(status) {
    return MARKS.includes(status);
}

module.exports = { LIVE_ATTENDANCE, FINAL_ATTENDANCE, MARKS, seatsTaken, capacityVerdict, remainingSessions, feeItemIdFor, holdTargets, enrolmentStatusAfter, validMark };
