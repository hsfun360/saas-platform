const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('./stationRules.service');

test('check-in window: early before the opening minutes, open until the slot ends, closed after', () => {
    const slot = { bookingDate: '2026-11-02', startTime: '18:00', endTime: '19:00' };
    assert.equal(rules.checkInState({ date: '2026-11-02', time: '17:00' }, slot, 30), 'early');
    assert.equal(rules.checkInState({ date: '2026-11-02', time: '17:30' }, slot, 30), 'open');
    assert.equal(rules.checkInState({ date: '2026-11-02', time: '18:45' }, slot, 30), 'open');
    assert.equal(rules.checkInState({ date: '2026-11-02', time: '19:00' }, slot, 30), 'closed');
    assert.equal(rules.checkInState({ date: '2026-11-03', time: '08:00' }, slot, 30), 'closed');
});

test('opening hours per day type, null when unrestricted', () => {
    const type = { openTimeWeekday: '06:00:00', closeTimeWeekday: '22:00:00', openTimeWeekend: null, closeTimeWeekend: null };
    const wd = rules.openingHours(type, 'weekday');
    assert.deepEqual(wd, { open: 360, close: 1320 });
    assert.equal(rules.isOpenAt(wd, '05:59'), false);
    assert.equal(rules.isOpenAt(wd, '06:00'), true);
    assert.equal(rules.isOpenAt(wd, '22:00'), false);
    assert.equal(rules.openingHours(type, 'weekend'), null);
    assert.equal(rules.isOpenAt(null, '03:00'), true);
});

test('live count and capacity', () => {
    const regs = [{ status: 'in', guestCount: 2 }, { status: 'in', guestCount: 0 }, { status: 'out', guestCount: 5 }];
    assert.equal(rules.liveCount(regs), 4);
    assert.equal(rules.capacityVerdict({ count: 4, arriving: 1, capacity: 5, label: 'GYM' }), null);
    assert.match(rules.capacityVerdict({ count: 4, arriving: 2, capacity: 5, label: 'GYM' }), /GYM is at capacity - 4 of 5 inside, 2 arriving/);
    assert.equal(rules.capacityVerdict({ count: 99, arriving: 9, capacity: null, label: 'POOL' }), null);
});

test('issue limits and the due-back time', () => {
    const issues = [{ status: 'issued', patronId: 'p1', quantity: 2 }, { status: 'returned', patronId: 'p1', quantity: 5 }, { status: 'issued', patronId: 'p2', quantity: 1 }];
    assert.equal(rules.heldByPatron(issues, 'p1'), 2);
    assert.equal(rules.issueLimitVerdict({ held: 2, taking: 1, limit: 3, name: 'Ahmad', unitWord: 'towels' }), null);
    assert.match(rules.issueLimitVerdict({ held: 2, taking: 2, limit: 3, name: 'Ahmad', unitWord: 'towels' }), /Ahmad would hold 4 towels - the limit is 3 \(already holding 2\)/);
    assert.equal(rules.issueLimitVerdict({ held: 9, taking: 9, limit: 0, name: 'x', unitWord: 'lockers' }), null);
    assert.equal(rules.dueBackLocal({ issueDate: '2026-11-02', dueDays: 0, hours: { open: 360, close: 1320 } }), '2026-11-02T22:00');
    assert.equal(rules.dueBackLocal({ issueDate: '2026-11-02', dueDays: 2, hours: null }), '2026-11-04T23:59');
});

test('return outcomes: a unit frees, parks or is lost; a consumable may come back short', () => {
    assert.deepEqual(rules.returnOutcome({ condition: 'good', quantity: 1, trackUnits: true }), { status: 'returned', unitStatus: 'available', lostQuantity: 0, returnedQuantity: 1 });
    assert.deepEqual(rules.returnOutcome({ condition: 'damaged', quantity: 1, trackUnits: true }), { status: 'returned', unitStatus: 'out-of-service', lostQuantity: 0, returnedQuantity: 1 });
    assert.deepEqual(rules.returnOutcome({ condition: 'lost', quantity: 1, trackUnits: true }), { status: 'lost', unitStatus: 'out-of-service', lostQuantity: 1, returnedQuantity: 0 });
    assert.deepEqual(rules.returnOutcome({ condition: 'good', quantity: 3, returnedQuantity: 2, trackUnits: false }), { status: 'returned', unitStatus: null, lostQuantity: 1, returnedQuantity: 2 });
    assert.deepEqual(rules.returnOutcome({ condition: 'lost', quantity: 3, trackUnits: false }), { status: 'lost', unitStatus: null, lostQuantity: 3, returnedQuantity: 0 });
    assert.match(rules.returnOutcome({ condition: 'good', quantity: 3, returnedQuantity: 4, trackUnits: false }).error, /between 0 and 3/);
    assert.match(rules.returnOutcome({ condition: 'fine', quantity: 1, trackUnits: true }).error, /Pick the return condition/);
});
