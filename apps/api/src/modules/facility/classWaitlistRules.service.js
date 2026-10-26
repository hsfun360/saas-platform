// Facility classes - the PURE cancellation and waitlist rules (slice 5c,
// structures approved 2026-10-26): no DB, unit-tested. The class notice
// decides whether a seat cancels late (the fee stands) or in time (an
// unsettled bill is voided, a settled one goes to Finance); offered seats
// hold capacity; the queue is first come first served; an offer lapses at
// its expiry.

const { minutesUntil } = require('./bookingRules.service');

// The notice hours of a class: its own override, else the Specification's.
function noticeHoursFor(cls, setting) {
    if (cls && cls.cancellationNoticeHours !== null && cls.cancellationNoticeHours !== undefined) return Number(cls.cancellationNoticeHours);
    return Number(setting && setting.classCancellationNoticeHours !== undefined ? setting.classCancellationNoticeHours : 24);
}

// A cancel made NOW is late when the session starts inside the notice (or
// has already started); 0 hours = no notice rule.
function cancelVerdict({ now, sessionDate, startTime, noticeHours }) {
    const minutes = minutesUntil(now, String(sessionDate), String(startTime).slice(0, 5));
    const late = minutes <= 0 || (Number(noticeHours) > 0 && minutes < Number(noticeHours) * 60);
    return { late, minutesUntilStart: minutes };
}

// What happens to the seat's bill on a cancel in time: an open bill is
// voided, a settled one is left for Finance (a credit note), none = nothing.
function billOutcome(bill, { late }) {
    if (!bill) return 'none';
    if (late) return 'stands';
    if (bill.status === 'open') return 'void';
    if (bill.status === 'settled') return 'finance';
    return 'none';
}

// Offered waitlist rows hold their seat: counted as taken.
function heldSeats(waitlistRows, { excludeId = null } = {}) {
    return (waitlistRows || []).filter((w) => w.status === 'offered' && w.id !== excludeId).length;
}

// The first in the queue (by createdAt) still waiting.
function nextWaiting(rows) {
    return [...(rows || [])].filter((w) => w.status === 'waiting').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0] || null;
}

// When an offer made at `at` lapses.
function offerExpiry(at, hours) {
    return new Date(new Date(at).getTime() + Math.max(1, Number(hours) || 24) * 3600000);
}

// Offers past their expiry at `now`.
function lapsedOffers(rows, now = new Date()) {
    return (rows || []).filter((w) => w.status === 'offered' && w.offerExpiresAt && new Date(w.offerExpiresAt).getTime() <= now.getTime());
}

module.exports = { noticeHoursFor, cancelVerdict, billOutcome, heldSeats, nextWaiting, offerExpiry, lapsedOffers };
