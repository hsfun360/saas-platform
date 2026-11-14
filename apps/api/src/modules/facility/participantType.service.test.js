const test = require('node:test');
const assert = require('node:assert/strict');
const types = require('./participantType.service');
const { SYSTEM_PARTICIPANT_TYPES, BASE_IDENTITIES, BASE_IDENTITY_KEYS, VISITING_BASE_IDENTITY_KEYS, VISITING_PATRON_TYPE_KEYS } = require('./facility.constants');

// The pure helpers over a participant type catalog (no database).
const catalog = [
    ...SYSTEM_PARTICIPANT_TYPES.map((s) => ({ ...s, isSystem: true, isActive: true })),
    { code: 'CHILD', description: 'Child guest', baseIdentity: 'guest', isSystem: false, isActive: true },
    { code: 'SPOUSE', description: 'Spouse', baseIdentity: 'member-guest', isSystem: false, isActive: true },
];

test('the system participant types: the three of the club and the two visiting price groups', () => {
    assert.deepEqual(SYSTEM_PARTICIPANT_TYPES.map((s) => s.code), ['member', 'member-guest', 'guest', 'affiliate', 'reciprocal']);
    // Each system code is its own base key, so a code prices and behaves alike.
    for (const s of SYSTEM_PARTICIPANT_TYPES) assert.equal(s.baseIdentity, s.code);
    assert.deepEqual(VISITING_BASE_IDENTITY_KEYS, ['affiliate', 'reciprocal']);
    // The station prices a visiting member by the patron group on the pass.
    assert.deepEqual(VISITING_BASE_IDENTITY_KEYS, VISITING_PATRON_TYPE_KEYS);
    assert.deepEqual(BASE_IDENTITIES.filter((b) => b.systemOnly).map((b) => b.key), ['affiliate', 'reciprocal']);
    assert.equal(BASE_IDENTITY_KEYS.length, 5);
});

test('a visiting member is a price group: never a guest line, never a member standing', () => {
    for (const code of ['affiliate', 'reciprocal']) {
        assert.equal(types.isVisitingMember(catalog, code), true);
        assert.equal(types.isGuestLike(catalog, code), false);
        assert.equal(types.isVisitorGuest(catalog, code), false);
        assert.equal(types.hasMemberStanding(catalog, code), false);
    }
    for (const code of ['member', 'member-guest', 'guest', 'CHILD', 'SPOUSE']) assert.equal(types.isVisitingMember(catalog, code), false);
    assert.equal(types.isVisitingMember(catalog, 'NOPE'), false);
    // The older classes are as they were.
    assert.equal(types.isVisitorGuest(catalog, 'CHILD'), true);
    assert.equal(types.isGuestLike(catalog, 'SPOUSE'), true);
    assert.equal(types.hasMemberStanding(catalog, 'SPOUSE'), true);
    assert.equal(types.labelOf(catalog, 'reciprocal'), 'Reciprocal Member');
});

test('the pickers: a guest line offers guest-like types only, a booking never a visiting member', () => {
    const vocab = types.asVocabulary(catalog);
    assert.deepEqual(vocab.filter((t) => types.isGuestLike(catalog, t.key)).map((t) => t.key), ['member-guest', 'guest', 'CHILD', 'SPOUSE']);
    assert.deepEqual(vocab.filter((t) => !types.isVisitingMember(catalog, t.key)).map((t) => t.key), ['member', 'member-guest', 'guest', 'CHILD', 'SPOUSE']);
});
