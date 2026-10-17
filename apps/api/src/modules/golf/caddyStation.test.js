// Unit tests for the caddy station's pure rules (2026-10-17): the FIFO queue,
// the swap reasons and the code resolver; plus the shared slot rule with the
// caddy wording.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';
const { test } = require('node:test');
const assert = require('node:assert');
const { queueOrder, nextUp, countsAsRound, tokenFromCode } = require('./caddyStation.service');
const { buildSlots } = require('./buggyStation.service');

const A = (caddyNo, status, queuedAt) => ({ caddyNo, status, queuedAt });

test('queueOrder / nextUp: present caddies by queuedAt, out and off excluded', () => {
    const rows = [
        A('C-003', 'present', '2026-10-17T00:30:00Z'),
        A('C-001', 'out', '2026-10-17T00:00:00Z'),
        A('C-002', 'present', '2026-10-17T00:10:00Z'),
        A('C-004', 'off', '2026-10-17T00:05:00Z'),
    ];
    assert.deepStrictEqual(queueOrder(rows).map((r) => r.caddyNo), ['C-002', 'C-003']);
    assert.strictEqual(nextUp(rows).caddyNo, 'C-002');
    assert.strictEqual(nextUp([]), null);
});

test('countsAsRound: only a complaint drops the swapped-out round', () => {
    assert.strictEqual(countsAsRound('unwell'), true);
    assert.strictEqual(countsAsRound('player-request'), true);
    assert.strictEqual(countsAsRound('complaint'), false);
    assert.strictEqual(countsAsRound('other'), true);
    assert.strictEqual(countsAsRound('nonsense'), false);
});

test('tokenFromCode: badge token or badge number', () => {
    assert.deepStrictEqual(tokenFromCode('0123456789abcdef0123456789abcdef'), { token: '0123456789abcdef0123456789abcdef', caddyNo: null });
    assert.deepStrictEqual(tokenFromCode(' c-012 '), { token: null, caddyNo: 'C-012' });
});

test('buildSlots with the caddy noun words the block reasons for caddies', () => {
    const players = [{ playerId: 'a', playerName: 'Ali', bookingProfileId: 'b1' }];
    const { slots } = buildSlots({ players, feeLines: [{ billItemId: '1', playerId: 'a', usageType: 'shared', quantity: 1, paid: false, billNo: 'G1' }], consumed: new Set(), noun: 'caddy' });
    assert.match(slots[0].blockReason, /shared caddy fee with no partner/);
    const paidSingle = buildSlots({ players, feeLines: [{ billItemId: '2', playerId: 'a', usageType: 'single', quantity: 1, paid: false, billNo: 'G1' }], consumed: new Set(), noun: 'caddy' });
    assert.match(paidSingle.slots[0].blockReason, /^Caddy fee not yet paid/);
});
