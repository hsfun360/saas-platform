// Unit tests for the Player Type catalog helpers (pure functions).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';
const { test } = require('node:test');
const assert = require('node:assert');
const svc = require('./playerType.service');
const { SYSTEM_PLAYER_TYPES } = require('./playerType.constants');

const types = [
    ...SYSTEM_PLAYER_TYPES.map((s, i) => ({ id: String(i), ...s, requiresApproval: false, isSystem: true, isActive: true })),
    { id: 'a', code: 'MGA', description: 'MGA affiliate', baseIdentity: 'affiliate', requiresApproval: true, isSystem: false, isActive: true, sortOrder: 10 },
    { id: 'h', code: 'HOTEL', description: 'Hotel guest', baseIdentity: 'guest', requiresApproval: false, isSystem: false, isActive: false, sortOrder: 11 },
];

test('baseOf resolves a type to its engine class, legacy base keys to themselves, unknown to null', () => {
    assert.strictEqual(svc.baseOf(types, 'MGA'), 'affiliate');
    assert.strictEqual(svc.baseOf(types, 'member-guest'), 'member-guest');
    assert.strictEqual(svc.baseOf([], 'guest'), 'guest');
    assert.strictEqual(svc.baseOf(types, 'NOPE'), null);
});

test('pickable leaves out inactive and affiliate-base types', () => {
    assert.deepStrictEqual(svc.pickable(types).map((t) => t.code), ['member', 'member-guest', 'guest']);
});

test('the base-class tests follow the base identity, not the code', () => {
    assert.strictEqual(svc.isGuestLike(types, 'MGA'), true);
    assert.strictEqual(svc.isGuestLike(types, 'member-guest'), true);
    assert.strictEqual(svc.isGuestLike(types, 'member'), false);
    assert.strictEqual(svc.hasMemberStanding(types, 'member-guest'), true);
    assert.strictEqual(svc.hasMemberStanding(types, 'HOTEL'), false);
    assert.strictEqual(svc.needsGuestName(types, 'HOTEL'), true);
    assert.strictEqual(svc.needsGuestName(types, 'MGA'), true);
    assert.strictEqual(svc.isMemberBase(types, 'member'), true);
});

test('asVocabulary and labelsOf expose the description as the label', () => {
    assert.deepStrictEqual(svc.asVocabulary(types)[3], { key: 'MGA', label: 'MGA affiliate', baseIdentity: 'affiliate', requiresApproval: true });
    assert.strictEqual(svc.labelsOf(types).get('guest'), 'Guest / Visitor');
    assert.strictEqual(svc.labelOf(types, 'ZZZ'), 'ZZZ');
});
