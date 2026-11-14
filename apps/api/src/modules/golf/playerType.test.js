// Unit tests for the Player Type catalog helpers (pure functions).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';
const { test } = require('node:test');
const assert = require('node:assert');
const svc = require('./playerType.service');
const { SYSTEM_PLAYER_TYPES, BASE_IDENTITIES } = require('./playerType.constants');

const types = [
    ...SYSTEM_PLAYER_TYPES.map((s, i) => ({ id: String(i), ...s, requiresApproval: false, isSystem: true, isActive: true })),
    { id: 'a', code: 'MGA', description: 'MGA affiliate', baseIdentity: 'affiliate', requiresApproval: true, isSystem: false, isActive: true, sortOrder: 10 },
    { id: 'r', code: 'RECIP', description: 'Reciprocal club', baseIdentity: 'reciprocal', requiresApproval: false, isSystem: false, isActive: true, sortOrder: 11 },
    { id: 'h', code: 'HOTEL', description: 'Hotel guest', baseIdentity: 'guest', requiresApproval: false, isSystem: false, isActive: false, sortOrder: 12 },
    { id: 's', code: 'SPOUSE-G', description: 'Spouse as guest', baseIdentity: 'member-guest', requiresApproval: false, isSystem: false, isActive: true, sortOrder: 13 },
];

test('six engine classes, four system types (2026-11-13)', () => {
    assert.deepStrictEqual(BASE_IDENTITIES.map((b) => b.key), ['member', 'member-guest', 'guest', 'visitor', 'affiliate', 'reciprocal']);
    assert.deepStrictEqual(SYSTEM_PLAYER_TYPES.map((t) => t.code), ['member', 'member-guest', 'guest', 'visitor']);
});

test('baseOf resolves a type to its engine class, legacy base keys to themselves, unknown to null', () => {
    assert.strictEqual(svc.baseOf(types, 'MGA'), 'affiliate');
    assert.strictEqual(svc.baseOf(types, 'RECIP'), 'reciprocal');
    assert.strictEqual(svc.baseOf(types, 'member-guest'), 'member-guest');
    assert.strictEqual(svc.baseOf([], 'guest'), 'guest');
    assert.strictEqual(svc.baseOf([], 'visitor'), 'visitor');
    assert.strictEqual(svc.baseOf(types, 'NOPE'), null);
});

test('pickable by channel: booking hides visitors and the derived system member-guest; desk adds visitors; group keeps everything but visit-only classes', () => {
    assert.deepStrictEqual(svc.pickable(types).map((t) => t.code), ['member', 'guest', 'SPOUSE-G']);
    assert.deepStrictEqual(svc.pickable(types, 'desk').map((t) => t.code), ['member', 'guest', 'visitor', 'SPOUSE-G']);
    assert.deepStrictEqual(svc.pickable(types, 'group').map((t) => t.code), ['member', 'member-guest', 'guest', 'visitor', 'SPOUSE-G']);
});

test('the class tests follow the base identity, not the code', () => {
    assert.strictEqual(svc.isGuestLike(types, 'MGA'), true);
    assert.strictEqual(svc.isGuestLike(types, 'visitor'), true);
    assert.strictEqual(svc.isGuestLike(types, 'member-guest'), true);
    assert.strictEqual(svc.isGuestLike(types, 'member'), false);
    // Hosted guests draw on a host member; visitors and club visitors never do.
    assert.strictEqual(svc.isHostedGuest(types, 'guest'), true);
    assert.strictEqual(svc.isHostedGuest(types, 'SPOUSE-G'), true);
    assert.strictEqual(svc.isHostedGuest(types, 'visitor'), false);
    assert.strictEqual(svc.isHostedGuest(types, 'MGA'), false);
    assert.strictEqual(svc.isHostedGuest(types, 'RECIP'), false);
    assert.strictEqual(svc.isVisitorBase(types, 'visitor'), true);
    assert.strictEqual(svc.isClubVisitor(types, 'MGA'), true);
    assert.strictEqual(svc.isClubVisitor(types, 'RECIP'), true);
    assert.strictEqual(svc.isClubVisitor(types, 'guest'), false);
    assert.strictEqual(svc.hasMemberStanding(types, 'member-guest'), true);
    assert.strictEqual(svc.hasMemberStanding(types, 'HOTEL'), false);
    assert.strictEqual(svc.needsGuestName(types, 'HOTEL'), true);
    assert.strictEqual(svc.needsGuestName(types, 'visitor'), true);
    assert.strictEqual(svc.needsGuestName(types, 'MGA'), true);
    assert.strictEqual(svc.needsGuestName(types, 'RECIP'), true);
    assert.strictEqual(svc.needsGuestName(types, 'SPOUSE-G'), false);
    assert.strictEqual(svc.isMemberBase(types, 'member'), true);
    assert.deepStrictEqual(svc.codesOfBase(types, 'member-guest'), ['member-guest', 'SPOUSE-G']);
});

test('asVocabulary and labelsOf expose the description as the label', () => {
    assert.deepStrictEqual(svc.asVocabulary(types)[4], { key: 'MGA', label: 'MGA affiliate', baseIdentity: 'affiliate', requiresApproval: true });
    assert.strictEqual(svc.labelsOf(types).get('guest'), 'Guest');
    assert.strictEqual(svc.labelsOf(types).get('visitor'), 'Visitor');
    assert.strictEqual(svc.labelOf(types, 'ZZZ'), 'ZZZ');
});
