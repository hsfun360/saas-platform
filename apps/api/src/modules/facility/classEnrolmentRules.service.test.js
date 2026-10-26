const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('./classEnrolmentRules.service');

test('seats taken count the live rows and the capacity verdict names what is left', () => {
    const rows = [{ status: 'enrolled' }, { status: 'attended' }, { status: 'cancelled' }, { status: 'no-show' }];
    assert.equal(rules.seatsTaken(rows), 3);
    assert.equal(rules.capacityVerdict({ taken: 3, capacity: 6, label: 'YOGA 18:00' }), null);
    assert.match(rules.capacityVerdict({ taken: 6, capacity: 6, label: 'YOGA 18:00' }), /YOGA 18:00 is full - 6 of 6 seats taken/);
    assert.match(rules.capacityVerdict({ taken: 5, arriving: 2, capacity: 6, label: 'YOGA 18:00' }), /has 1 seat left - 2 arriving/);
    assert.equal(rules.capacityVerdict({ taken: 99, capacity: null, label: 'x' }), null);
});

test('a term enrolment takes the scheduled sessions from today on', () => {
    const sessions = [
        { sessionDate: '2026-11-02', status: 'held' },
        { sessionDate: '2026-11-04', status: 'scheduled' },
        { sessionDate: '2026-11-09', status: 'cancelled' },
        { sessionDate: '2026-11-11', status: 'scheduled' },
    ];
    assert.deepEqual(rules.remainingSessions(sessions, '2026-11-04').map((s) => s.sessionDate), ['2026-11-04', '2026-11-11']);
    assert.deepEqual(rules.remainingSessions(sessions, '2026-11-12'), []);
});

test('the fee item follows the audience', () => {
    const cls = { feeTransactionTypeId: 'm', visitorFeeTransactionTypeId: 'v' };
    assert.equal(rules.feeItemIdFor(cls, 'member'), 'm');
    assert.equal(rules.feeItemIdFor(cls, 'other'), 'v');
    assert.equal(rules.feeItemIdFor({ feeTransactionTypeId: 'm', visitorFeeTransactionTypeId: null }, 'other'), 'm');
    assert.equal(rules.feeItemIdFor({ feeTransactionTypeId: null, visitorFeeTransactionTypeId: null }, 'member'), null);
});

test('Hold marks the unmarked rows and an enrolment completes when every row is final', () => {
    const rows = [{ id: 1, status: 'enrolled' }, { id: 2, status: 'attended' }, { id: 3, status: 'excused' }, { id: 4, status: 'cancelled' }];
    assert.deepEqual(rules.holdTargets(rows).map((r) => r.id), [1]);
    assert.equal(rules.enrolmentStatusAfter(rows), 'enrolled');
    assert.equal(rules.enrolmentStatusAfter(rows.map((r) => (r.id === 1 ? { ...r, status: 'no-show' } : r))), 'completed');
    assert.equal(rules.enrolmentStatusAfter([{ status: 'cancelled' }]), 'enrolled');
    assert.equal(rules.enrolmentStatusAfter(rows, 'cancelled'), 'cancelled');
    assert.equal(rules.validMark('attended'), true);
    assert.equal(rules.validMark('cancelled'), false);
});
