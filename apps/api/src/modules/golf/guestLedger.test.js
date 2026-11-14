// Unit tests for the pure rules of the member's guests in golf (2026-11-13).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';
const { test } = require('node:test');
const assert = require('node:assert');
const { guestControlRefusal, quotaRefusal, allowanceRefusal, derivedNote } = require('./guestLedger.service');
const { resolveGuestControl } = require('./bookingAvailability.service');

test('guest control: a member as guest is a guest; visitors have their own flag; club visitors are exempt', () => {
    const open = { allowGuest: true, allowVisitor: true };
    const noGuests = { allowGuest: false, allowVisitor: true };
    const noVisitors = { allowGuest: true, allowVisitor: false };
    assert.strictEqual(guestControlRefusal(open, ['member', 'guest', 'member-guest', 'visitor']), null);
    assert.match(guestControlRefusal(noGuests, ['member', 'guest']), /Guests are not allowed/);
    assert.match(guestControlRefusal(noGuests, ['member', 'member-guest']), /Guests are not allowed/);
    assert.strictEqual(guestControlRefusal(noGuests, ['member', 'visitor']), null);
    assert.match(guestControlRefusal(noVisitors, ['visitor']), /Visitors are not allowed/);
    assert.strictEqual(guestControlRefusal(noVisitors, ['member', 'guest']), null);
    // Affiliated and reciprocal club members never trip either flag.
    assert.strictEqual(guestControlRefusal({ allowGuest: false, allowVisitor: false }, ['member', 'affiliate', 'reciprocal']), null);
});

test('resolveGuestControl answers { allowGuest, allowVisitor }: master off = open, exception rule beats the day-type flags', () => {
    const setting = { guestControlEnabled: true, allowGuestWeekday: true, allowVisitorWeekday: false, allowGuestWeekend: false, allowVisitorWeekend: false };
    assert.deepStrictEqual(resolveGuestControl({ ...setting, guestControlEnabled: false }, [], 'c1', 'weekend', 480), { allowGuest: true, allowVisitor: true });
    assert.deepStrictEqual(resolveGuestControl(setting, [], 'c1', 'weekday', 480), { allowGuest: true, allowVisitor: false });
    assert.deepStrictEqual(resolveGuestControl(setting, [], 'c1', 'weekend', 480), { allowGuest: false, allowVisitor: false });
    const rule = { courseId: null, dayScope: 'weekend', startTime: null, endTime: null, allowGuest: true, allowVisitor: true };
    assert.deepStrictEqual(resolveGuestControl(setting, [rule], 'c1', 'weekend', 480), { allowGuest: true, allowVisitor: true });
});

test('per-booking quota: NULL = no limit, 0 = no guests, over the number refuses with the count', () => {
    assert.strictEqual(quotaRefusal(null, 3, 'Gold'), null);
    assert.strictEqual(quotaRefusal(3, 3, 'Gold'), null);
    assert.strictEqual(quotaRefusal(2, 0, 'Gold'), null);
    assert.strictEqual(quotaRefusal(0, 1, 'Social'), 'Membership type Social cannot bring guests.');
    assert.match(quotaRefusal(2, 3, 'Gold'), /up to 2 guest\(s\) per booking - this booking has 3/);
    assert.match(quotaRefusal(2, 3, 'Gold', { would: true }), /this booking would have 3/);
    assert.match(quotaRefusal(0, 1, null), /^Membership type cannot bring guests\.$/);
});

test('monthly allowance: no limit never refuses; refuses when the remaining visits are fewer than needed', () => {
    const host = { name: 'Tan Ah Kow', memberNo: 'G-001' };
    assert.strictEqual(allowanceRefusal(null, 2, host), null);
    assert.strictEqual(allowanceRefusal({ allowance: null, used: 9, remaining: null }, 2, host), null);
    assert.strictEqual(allowanceRefusal({ allowance: 4, used: 2, remaining: 2 }, 2, host), null);
    assert.strictEqual(allowanceRefusal({ allowance: 4, used: 4, remaining: 0 }, 0, host), null);
    assert.strictEqual(
        allowanceRefusal({ allowance: 4, used: 3, remaining: 1 }, 2, host),
        'Tan Ah Kow (G-001) has 1 of 4 monthly guest visits left - this booking needs 2.',
    );
    assert.match(allowanceRefusal({ allowance: 4, used: 4, remaining: 0 }, 1, host, 'this registration'), /this registration needs 1\.$/);
});

test('derivedNote names each member the engine turned into a guest, with the reason', () => {
    assert.strictEqual(derivedNote([]), '');
    assert.strictEqual(
        derivedNote([{ playerName: 'Lim', memberNo: 'S-9', reason: 'E1 at 08:00 on 2026-11-21 is outside the playing rights of Member' }]),
        ' Lim (S-9) plays as a guest - E1 at 08:00 on 2026-11-21 is outside the playing rights of Member.',
    );
});
