const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('./classWaitlistRules.service');

test('the class notice: the class override first, else the Specification, else 24', () => {
    assert.equal(rules.noticeHoursFor({ cancellationNoticeHours: 6 }, { classCancellationNoticeHours: 24 }), 6);
    assert.equal(rules.noticeHoursFor({ cancellationNoticeHours: 0 }, { classCancellationNoticeHours: 24 }), 0);
    assert.equal(rules.noticeHoursFor({ cancellationNoticeHours: null }, { classCancellationNoticeHours: 48 }), 48);
    assert.equal(rules.noticeHoursFor(null, {}), 24);
});

test('a cancel is late inside the notice or after the start, never with a 0-hour rule before the start', () => {
    const now = { date: '2026-11-02', time: '10:00' };
    assert.equal(rules.cancelVerdict({ now, sessionDate: '2026-11-03', startTime: '18:00', noticeHours: 24 }).late, false);
    assert.equal(rules.cancelVerdict({ now, sessionDate: '2026-11-03', startTime: '09:00', noticeHours: 24 }).late, true);
    assert.equal(rules.cancelVerdict({ now, sessionDate: '2026-11-02', startTime: '09:00', noticeHours: 0 }).late, true);
    assert.equal(rules.cancelVerdict({ now, sessionDate: '2026-11-02', startTime: '10:30', noticeHours: 0 }).late, false);
});

test('the bill outcome: void an open bill in time, Finance for a settled one, the fee stands when late', () => {
    assert.equal(rules.billOutcome({ status: 'open' }, { late: false }), 'void');
    assert.equal(rules.billOutcome({ status: 'settled' }, { late: false }), 'finance');
    assert.equal(rules.billOutcome({ status: 'open' }, { late: true }), 'stands');
    assert.equal(rules.billOutcome(null, { late: false }), 'none');
    assert.equal(rules.billOutcome({ status: 'voided' }, { late: false }), 'none');
});

test('offered rows hold seats, the queue is first come first served, offers lapse at expiry', () => {
    const rows = [
        { id: 'a', status: 'offered', createdAt: '2026-11-01T10:00:00Z', offerExpiresAt: '2026-11-02T10:00:00Z' },
        { id: 'b', status: 'waiting', createdAt: '2026-11-01T11:00:00Z' },
        { id: 'c', status: 'waiting', createdAt: '2026-11-01T09:00:00Z' },
        { id: 'd', status: 'lapsed', createdAt: '2026-11-01T08:00:00Z' },
    ];
    assert.equal(rules.heldSeats(rows), 1);
    assert.equal(rules.heldSeats(rows, { excludeId: 'a' }), 0);
    assert.equal(rules.nextWaiting(rows).id, 'c');
    assert.equal(rules.nextWaiting([]), null);
    assert.equal(rules.offerExpiry('2026-11-01T10:00:00Z', 24).toISOString(), '2026-11-02T10:00:00.000Z');
    assert.deepEqual(rules.lapsedOffers(rows, new Date('2026-11-02T10:00:00Z')).map((w) => w.id), ['a']);
    assert.deepEqual(rules.lapsedOffers(rows, new Date('2026-11-02T09:59:00Z')), []);
});
