// Unit tests for the buggy station's pure slot pairing rule and the code
// resolver (user decisions 2026-10-17).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildSlots, tokenFromCode } = require('./buggyStation.service');

const P = (id, bookingProfileId = 'bk1') => ({ playerId: id, playerName: `Player ${id}`, memberNo: null, golferId: null, bookingProfileId });
const L = (billItemId, playerId, usageType, paid = true, quantity = 1) => ({ billItemId, playerId, usageType, quantity, paid, billNo: `G${billItemId}` });

test('buildSlots: singles are one slot each; shared fees pair in seat order within the booking', () => {
    const players = [P('a'), P('b'), P('c'), P('d')];
    const feeLines = [L('1', 'a', 'shared'), L('2', 'b', 'shared'), L('3', 'c', 'single'), L('4', 'd', 'shared')];
    const { slots, noFee } = buildSlots({ players, feeLines, consumed: new Set() });
    assert.strictEqual(noFee.length, 0);
    const single = slots.find((s) => s.usageType === 'single');
    assert.deepStrictEqual(single.riders.map((r) => r.playerId), ['c']);
    assert.strictEqual(single.issuable, true);
    const pair = slots.find((s) => s.usageType === 'shared' && s.complete);
    assert.deepStrictEqual(pair.riders.map((r) => r.playerId), ['a', 'b']);
    assert.strictEqual(pair.issuable, true);
    const lone = slots.find((s) => s.usageType === 'shared' && !s.complete);
    assert.deepStrictEqual(lone.riders.map((r) => r.playerId), ['d']);
    assert.strictEqual(lone.issuable, false);
    assert.match(lone.blockReason, /no partner/);
});

test('buildSlots: an unpaid line blocks the slot and names the bill; consumed lines drop out', () => {
    const players = [P('a'), P('b')];
    const feeLines = [L('1', 'a', 'shared', true), L('2', 'b', 'shared', false)];
    const open = buildSlots({ players, feeLines, consumed: new Set() });
    assert.strictEqual(open.slots.length, 1);
    assert.strictEqual(open.slots[0].complete, true);
    assert.strictEqual(open.slots[0].issuable, false);
    assert.match(open.slots[0].blockReason, /not yet paid.*Player b.*G2/);
    const consumed = buildSlots({ players, feeLines, consumed: new Set(['1', '2']) });
    assert.strictEqual(consumed.slots.length, 0);
    assert.strictEqual(consumed.noFee.length, 0, 'a consumed fee still counts as a fee for the player');
});

test('buildSlots: a shared line with quantity 2 is a whole buggy for one player; pairing prefers the same booking', () => {
    const players = [P('a', 'bk1'), P('x', 'bk2'), P('b', 'bk1')];
    const one = buildSlots({ players, feeLines: [L('1', 'a', 'shared', true, 2)], consumed: new Set() });
    assert.strictEqual(one.slots.length, 1);
    assert.deepStrictEqual(one.slots[0].riders.map((r) => r.playerId), ['a']);
    assert.strictEqual(one.slots[0].complete, true);
    assert.deepStrictEqual(one.noFee.map((p) => p.playerId), ['x', 'b']);
    const two = buildSlots({ players, feeLines: [L('1', 'a', 'shared'), L('2', 'x', 'shared'), L('3', 'b', 'shared')], consumed: new Set() });
    const complete = two.slots.find((s) => s.complete);
    assert.deepStrictEqual(complete.riders.map((r) => r.playerId), ['a', 'b'], 'a and b share bk1, x waits');
    assert.deepStrictEqual(two.slots.find((s) => !s.complete).riders.map((r) => r.playerId), ['x']);
});

test('tokenFromCode: station URL, raw token, or buggy number', () => {
    assert.deepStrictEqual(tokenFromCode('https://club.example/golf/buggy-station?b=0123456789abcdef0123456789abcdef'), { token: '0123456789abcdef0123456789abcdef', buggyNo: null });
    assert.deepStrictEqual(tokenFromCode('0123456789ABCDEF0123456789ABCDEF'), { token: '0123456789abcdef0123456789abcdef', buggyNo: null });
    assert.deepStrictEqual(tokenFromCode(' b-012 '), { token: null, buggyNo: 'B-012' });
    assert.deepStrictEqual(tokenFromCode(''), { token: null, buggyNo: null });
});
