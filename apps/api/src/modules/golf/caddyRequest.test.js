// Unit tests for the named-caddy request rules (2026-10-18): the reserve
// window, the lapse rule, request matching, the queue's reservation skip and
// the rounds report fold.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';
const { test } = require('node:test');
const assert = require('node:assert');
const { inReserveWindow, hasLapsed, requestMatches } = require('./caddyRequest.service');
const { nextUp, reservedToSkip } = require('./caddyStation.service');
const { roundCounts, summarise, totalsOf } = require('./caddyRounds.service');

test('inReserveWindow: within 90 minutes before the tee time, up to 60 after', () => {
    assert.strictEqual(inReserveWindow('10:00', '08:29'), false);
    assert.strictEqual(inReserveWindow('10:00', '08:30'), true);
    assert.strictEqual(inReserveWindow('10:00', '10:00'), true);
    assert.strictEqual(inReserveWindow('10:00', '11:00'), true);
    assert.strictEqual(inReserveWindow('10:00', '11:01'), false);
    assert.strictEqual(inReserveWindow(null, '09:00'), false);
});

test('hasLapsed: a past date, or a tee time more than an hour behind the club clock', () => {
    assert.strictEqual(hasLapsed({ playDate: '2026-10-17', teeTime: '10:00' }, '2026-10-18', '06:00'), true);
    assert.strictEqual(hasLapsed({ playDate: '2026-10-19', teeTime: '10:00' }, '2026-10-18', '23:00'), false);
    assert.strictEqual(hasLapsed({ playDate: '2026-10-18', teeTime: '10:00' }, '2026-10-18', '11:00'), false);
    assert.strictEqual(hasLapsed({ playDate: '2026-10-18', teeTime: '10:00' }, '2026-10-18', '11:01'), true);
    assert.strictEqual(hasLapsed({ playDate: '2026-10-18', teeTime: null }, '2026-10-18', '23:59'), false);
});

test('requestMatches: by golfer when the request names one, else by booking', () => {
    const forBooking = { caddyId: 'c1', playDate: '2026-10-18', bookingProfileId: 'b1', playerId: null };
    const forPlayer = { caddyId: 'c1', playDate: '2026-10-18', bookingProfileId: 'b1', playerId: 'p2' };
    assert.strictEqual(requestMatches(forBooking, { caddyId: 'c1', playDate: '2026-10-18', bookingProfileId: 'b1', playerIds: ['p1'] }), true);
    assert.strictEqual(requestMatches(forBooking, { caddyId: 'c1', playDate: '2026-10-18', bookingProfileId: 'b2', playerIds: ['p1'] }), false);
    assert.strictEqual(requestMatches(forBooking, { caddyId: 'c2', playDate: '2026-10-18', bookingProfileId: 'b1', playerIds: ['p1'] }), false);
    assert.strictEqual(requestMatches(forPlayer, { caddyId: 'c1', playDate: '2026-10-18', bookingProfileId: 'b1', playerIds: ['p1'] }), false);
    assert.strictEqual(requestMatches(forPlayer, { caddyId: 'c1', playDate: '2026-10-18', bookingProfileId: 'b1', playerIds: ['p1', 'p2'] }), true);
});

test('nextUp skips a caddy reserved for another flight but not one reserved for this flight', () => {
    const rows = [
        { caddyId: 'c1', caddyNo: 'C-001', status: 'present', queuedAt: '2026-10-18T00:00:00Z' },
        { caddyId: 'c2', caddyNo: 'C-002', status: 'present', queuedAt: '2026-10-18T00:10:00Z' },
    ];
    const reserved = new Map([['c1', { teeTime: '10:00', bookingProfileId: 'b1', playerId: null }]]);
    assert.strictEqual(nextUp(rows, reservedToSkip(reserved, { bookingProfileId: 'b9', playerIds: ['p9'] })).caddyNo, 'C-002');
    assert.strictEqual(nextUp(rows, reservedToSkip(reserved, { bookingProfileId: 'b1', playerIds: ['p1'] })).caddyNo, 'C-001');
    assert.strictEqual(nextUp(rows.slice(0, 1), reservedToSkip(reserved, { bookingProfileId: 'b9', playerIds: [] })), null);
});

test('rounds report: completed and counted swaps count, a complaint swap does not, open rounds stay apart', () => {
    const P = (n) => Array.from({ length: n }, (_, i) => ({ playerId: `p${i}` }));
    const rows = summarise([
        { caddyId: 'c1', caddyNo: 'C-001', status: 'completed', holes: 18, holesPlayed: 18, requestedByName: true, players: P(2) },
        { caddyId: 'c1', caddyNo: 'C-001', status: 'swapped', countsAsRound: false, swapReason: 'complaint', holes: 18, holesPlayed: 5, players: P(1) },
        { caddyId: 'c1', caddyNo: 'C-001', status: 'swapped', countsAsRound: true, swapReason: 'unwell', holes: 9, holesPlayed: 4, players: P(1) },
        { caddyId: 'c1', caddyNo: 'C-001', status: 'assigned', holes: 18, players: P(1) },
        { caddyId: 'c2', caddyNo: 'C-002', status: 'completed', holes: 9, holesPlayed: 9, players: P(1) },
    ]);
    assert.strictEqual(roundCounts({ status: 'swapped', countsAsRound: false }), false);
    assert.deepStrictEqual(rows.map((r) => [r.caddyNo, r.rounds, r.roundsNotCounted, r.rounds9, r.rounds18, r.holesServed, r.golfersServed, r.requestedByName, r.open]), [
        ['C-001', 2, 1, 1, 1, 27, 4, 1, 1],
        ['C-002', 1, 0, 1, 0, 9, 1, 0, 0],
    ]);
    assert.deepStrictEqual(totalsOf(rows), { caddies: 2, rounds: 3, roundsNotCounted: 1, rounds9: 2, rounds18: 1, holesServed: 36, golfersServed: 5, requestedByName: 1, open: 1 });
});
