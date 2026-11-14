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

test('the live count adds the host only when the host is inside', () => {
    const regs = [
        { status: 'in', guestCount: 2 },
        { status: 'in', guestCount: 1, hostPresent: false },
        { status: 'out', guestCount: 3 },
    ];
    assert.equal(rules.liveCount(regs), 4);
    assert.equal(rules.partySize({ guestCount: 0, hostPresent: false }), 0);
});

test('entering from the panel: the type, the booking, the guest rules, the host and the room decide', () => {
    const ok = { allowed: true, reason: null };
    assert.deepEqual(rules.entryVerdict({ code: 'POOL', count: 39, capacity: 40 }), ok);
    assert.deepEqual(rules.entryVerdict({ code: 'POOL', inside: true, closedReason: 'closed' }), { allowed: false, reason: null });
    assert.equal(rules.entryVerdict({ code: 'POOL', closedReason: 'POOL is closed at 23:00 (open 07:00 to 22:00).' }).reason, 'POOL is closed at 23:00 (open 07:00 to 22:00).');
    assert.match(rules.entryVerdict({ code: 'POOL', needsBooking: true, hostName: 'Ahmad Faizal' }).reason, /holding a booking today - Ahmad Faizal has none/);
    assert.deepEqual(rules.entryVerdict({ code: 'POOL', needsBooking: true, hasBooking: true }), ok);
    assert.equal(rules.entryVerdict({ code: 'POOL', count: 40, capacity: 40 }).reason, 'Full - 40 of 40 inside.');
    assert.deepEqual(rules.entryVerdict({ code: 'POOL', count: 400, capacity: null }), ok);
    // A guest.
    const guest = { code: 'POOL', isGuest: true, hostName: 'Ahmad Faizal' };
    assert.equal(rules.entryVerdict({ ...guest, guestsAllowed: false }).reason, 'Visitor guests are not allowed on POOL now.');
    assert.equal(rules.entryVerdict({ ...guest, hostMustBePresent: true, hostInside: false }).reason, 'Ahmad Faizal must enter POOL first.');
    assert.deepEqual(rules.entryVerdict({ ...guest, hostMustBePresent: true, hostInside: true }), ok);
    assert.deepEqual(rules.entryVerdict({ ...guest, hostMustBePresent: false, hostInside: false }), ok);
    assert.equal(rules.entryVerdict({ ...guest, guestCap: 2, guestsOnEntry: 2 }).reason, 'At most 2 visitor guests per visit on POOL.');
    assert.equal(rules.entryVerdict({ ...guest, guestCap: 1, guestsOnEntry: 1 }).reason, 'At most 1 visitor guest per visit on POOL.');
    assert.equal(rules.entryVerdict({ ...guest, allowanceLeft: 0 }).reason, 'Ahmad Faizal has no guest visits left this month.');
    assert.deepEqual(rules.entryVerdict({ ...guest, allowanceLeft: 1 }), ok);
    // The member is not held by the guest rules.
    assert.deepEqual(rules.entryVerdict({ code: 'POOL', guestsAllowed: false, hostMustBePresent: true, allowanceLeft: 0 }), ok);
});

test('a guest keyed at the station: a contact makes a pass while the club registers door guests, a name alone is served by name, and the club may insist on the contact', () => {
    assert.match(rules.doorGuestVerdict({ name: '  ', mobile: '+60123456789' }).error, /guest's name/);
    assert.deepEqual(rules.doorGuestVerdict({ name: 'Tan', mobile: '+60123456789' }), { mode: 'pass' });
    assert.deepEqual(rules.doorGuestVerdict({ name: 'Tan', email: 'tan@example.com' }), { mode: 'pass' });
    // The phone input sends the bare dialling code when no number was typed.
    assert.deepEqual(rules.doorGuestVerdict({ name: 'Tan', mobile: '+60', email: '' }), { mode: 'name' });
    assert.deepEqual(rules.doorGuestVerdict({ name: 'Tan' }), { mode: 'name' });
    // Door passes switched OFF: the contact is ignored, the guest is served by name.
    assert.deepEqual(rules.doorGuestVerdict({ name: 'Tan', mobile: '+60123456789', passEnabled: false }), { mode: 'name' });
    // The club insists on a contact.
    assert.match(rules.doorGuestVerdict({ name: 'Tan', mobile: '+60', contactRequired: true }).error, /mobile number or email/);
    assert.deepEqual(rules.doorGuestVerdict({ name: 'Tan', mobile: '+60123456789', contactRequired: true }), { mode: 'pass' });
    assert.equal(rules.hasMobile('+60 12-345 6789'), true);
    assert.equal(rules.hasMobile(''), false);
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

test('the station does not serve the pass of a visiting affiliated or reciprocal member yet', () => {
    const pass = { registrationNo: 'G-00031', visitDateText: '14 Nov 2026', passState: 'valid' };
    assert.equal(rules.passVerdict({ ...pass, patronGroup: 'guest' }), null);
    assert.match(rules.passVerdict({ ...pass, patronGroup: 'reciprocal', accompanying: false }), /^Pass G-00031 belongs to a visiting reciprocal club member/);
    assert.match(rules.passVerdict({ ...pass, patronGroup: 'affiliate', accompanying: true }), /^Pass G-00031 belongs to a guest of a visiting affiliated club member/);
});
