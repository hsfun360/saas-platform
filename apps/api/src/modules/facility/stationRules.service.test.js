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
    // A use-only item holds nothing: the refusal counts the day's uses.
    assert.equal(rules.issueLimitVerdict({ held: 0, taking: 1, limit: 1, name: 'Ahmad', unitWord: 'x', usedToday: 'SHOWER' }), null);
    assert.equal(rules.issueLimitVerdict({ held: 1, taking: 1, limit: 1, name: 'Ahmad', unitWord: 'x', usedToday: 'SHOWER' }), 'Ahmad has already used SHOWER 1 time today - the limit is 1 a day.');
    assert.equal(rules.issueLimitVerdict({ held: 2, taking: 1, limit: 2, name: 'Ahmad', unitWord: 'x', usedToday: 'SHOWER' }), 'Ahmad has already used SHOWER 2 times today - the limit is 2 a day.');
    assert.equal(rules.issueLimitVerdict({ held: 0, taking: 3, limit: 2, name: 'Ahmad', unitWord: 'x', usedToday: 'SHOWER' }), '3 SHOWER uses are over the limit of 2 a day.');
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

// ---- slice 6b: scan and serve ----

test('what was scanned: a pass link or a bare token is a guest pass, anything else a member number', () => {
    const token = 'ab12'.repeat(16);
    assert.equal(rules.scanKind(`https://club.example/guest-pass/${token}`), 'pass');
    assert.equal(rules.scanKind(token), 'pass');
    assert.equal(rules.scanKind(token.toUpperCase()), 'pass');
    assert.equal(rules.scanKind('MEM26-000001'), 'member');
    assert.equal(rules.scanKind('  A0018 '), 'member');
    assert.equal(rules.scanKind(''), null);
    assert.equal(rules.scanKind(null), null);
});

test('a pass is served only on its own day and never once cancelled', () => {
    const pass = { registrationNo: 'G-00012', visitDateText: '14 Nov 2026' };
    assert.equal(rules.passVerdict({ ...pass, passState: 'valid' }), null);
    assert.equal(rules.passVerdict(null), 'No guest pass of this club matches that code.');
    assert.equal(rules.passVerdict({ ...pass, passState: 'cancelled' }), 'Pass G-00012 is cancelled.');
    assert.equal(rules.passVerdict({ ...pass, passState: 'upcoming' }), 'This pass is for 14 Nov 2026 - it is not valid today.');
    assert.equal(rules.passVerdict({ ...pass, passState: 'expired' }), 'This pass was for 14 Nov 2026 and has expired.');
});

test('a tile states why it cannot be tapped: members only, not inside, the limit, no unit, no price', () => {
    const base = { behaviour: 'units', isGuest: true, guestsAllowed: true, requiresEntry: false, inside: false, held: 0, limit: 1, freeUnits: 3, fee: null };
    assert.deepEqual(rules.serveTileVerdict(base), { allowed: true, reason: null });
    assert.deepEqual(rules.serveTileVerdict({ ...base, guestsAllowed: false }), { allowed: false, reason: 'Members only.' });
    // The same item serves the member whatever its guest switch says.
    assert.equal(rules.serveTileVerdict({ ...base, guestsAllowed: false, isGuest: false }).allowed, true);
    assert.deepEqual(rules.serveTileVerdict({ ...base, requiresEntry: true }), { allowed: false, reason: 'Only for a person inside a facility today.' });
    assert.equal(rules.serveTileVerdict({ ...base, requiresEntry: true, inside: true }).allowed, true);
    assert.deepEqual(rules.serveTileVerdict({ ...base, held: 1 }), { allowed: false, reason: 'Limit reached - holding 1 of 1.' });
    assert.deepEqual(rules.serveTileVerdict({ ...base, behaviour: 'use', held: 2, limit: 2 }), { allowed: false, reason: 'Limit reached - used 2 of 2 today.' });
    assert.equal(rules.serveTileVerdict({ ...base, held: 9, limit: 0 }).allowed, true);
    assert.deepEqual(rules.serveTileVerdict({ ...base, freeUnits: 0 }), { allowed: false, reason: 'No unit free.' });
    // A counted item needs no free unit.
    assert.equal(rules.serveTileVerdict({ ...base, behaviour: 'quantity', freeUnits: 0 }).allowed, true);
    assert.deepEqual(rules.serveTileVerdict({ ...base, fee: { code: 'LOCKERFEE', unitAmount: null } }), { allowed: false, reason: 'LOCKERFEE has no price today.' });
    assert.equal(rules.serveTileVerdict({ ...base, fee: { code: 'LOCKERFEE', unitAmount: null }, priceRequired: false }).allowed, true);
    assert.equal(rules.serveTileVerdict({ ...base, fee: { code: 'LOCKERFEE', unitAmount: 5 } }).allowed, true);
});

test('undo is for a wrong tap: inside the window, on a live issue or a use, and never past a settled bill', () => {
    const issuedAt = new Date('2026-11-12T02:00:00Z');
    const at = (min) => new Date(issuedAt.getTime() + min * 60000);
    assert.equal(rules.UNDO_MINUTES, 5);
    assert.equal(rules.undoVerdict({ status: 'issued', issuedAt, now: at(1) }), null);
    assert.equal(rules.undoVerdict({ status: 'used', issuedAt, now: at(5) }), null);
    assert.equal(rules.undoVerdict({ status: 'issued', issuedAt, now: at(4), billStatus: 'open' }), null);
    assert.match(rules.undoVerdict({ status: 'issued', issuedAt, now: at(6) }), /first 5 minutes/);
    assert.match(rules.undoVerdict({ status: 'issued', issuedAt, now: at(1), billStatus: 'settled' }), /already settled/);
    assert.match(rules.undoVerdict({ status: 'returned', issuedAt, now: at(1) }), /Already returned/);
});
