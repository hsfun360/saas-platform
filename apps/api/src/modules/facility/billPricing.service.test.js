const test = require('node:test');
const assert = require('node:assert/strict');
const pricing = require('./billPricing.service');

const fee = { id: 'fee', transactionType: 'BADM', chargeType: 'facility-fee', participantType: 'member', facilityTypeId: 'BADMINTON', isActive: true };
const cards = [
    {
        id: 'c1', effectiveDate: '2026-11-01', isActive: true, flatAmount: null,
        cells: [
            { participantType: 'member', dayScope: 'all', sessionId: null, amount: '20.00' },
            { participantType: 'member', dayScope: 'weekend', sessionId: null, amount: '30.00' },
            { participantType: 'member', dayScope: 'all', sessionId: 'pm', amount: '25.50' },
            { participantType: 'guest', dayScope: 'weekday', sessionId: null, amount: '40.00' },
        ],
    },
    { id: 'c0', effectiveDate: '2026-01-01', isActive: true, flatAmount: null, cells: [{ participantType: 'member', dayScope: 'all', sessionId: null, amount: '10.00' }] },
];

test('matrix price: the card in force on the date and the most specific cell', () => {
    assert.deepEqual(pricing.unitPriceOf(fee, cards, { date: '2026-11-02', participantType: 'member', dayType: 'weekday' }), { unitAmount: 20 });
    assert.deepEqual(pricing.unitPriceOf(fee, cards, { date: '2026-11-07', participantType: 'member', dayType: 'weekend' }), { unitAmount: 30 });
    assert.deepEqual(pricing.unitPriceOf(fee, cards, { date: '2026-11-02', participantType: 'member', dayType: 'weekday', sessionId: 'pm' }), { unitAmount: 25.5 });
    // Before the new card: the old card prices.
    assert.deepEqual(pricing.unitPriceOf(fee, cards, { date: '2026-06-01', participantType: 'member', dayType: 'weekday' }), { unitAmount: 10 });
});

test('a missing cell is refused naming the cell, a missing card naming the date', () => {
    const r = pricing.unitPriceOf(fee, cards, { date: '2026-11-07', participantType: 'guest', dayType: 'weekend', sessionName: 'Evening' });
    assert.match(r.missing, /'BADM' has no price for guest \/ weekend \/ Evening on 2026-11-07/);
    const none = pricing.unitPriceOf(fee, cards, { date: '2025-12-31', participantType: 'member', dayType: 'weekday' });
    assert.match(none.missing, /no price card in force on 2025-12-31/);
});

test('flat charge types take the card amount', () => {
    const misc = { transactionType: 'TOWEL', chargeType: 'miscellaneous' };
    assert.deepEqual(pricing.unitPriceOf(misc, [{ effectiveDate: '2026-01-01', isActive: true, flatAmount: '5.5', cells: [] }], { date: '2026-11-02', participantType: 'member', dayType: 'weekday' }), { unitAmount: 5.5 });
    assert.match(pricing.unitPriceOf(misc, [{ effectiveDate: '2026-01-01', isActive: true, flatAmount: null, cells: [] }], { date: '2026-11-02', participantType: 'member', dayType: 'weekday' }).missing, /no amount/);
});

test('default type: explicit pick, then the type-scoped default, then the general default', () => {
    const types = [
        fee,
        { id: 'gen', transactionType: 'FEE', chargeType: 'facility-fee', participantType: 'member', facilityTypeId: null, isActive: true },
        { id: 'guestfee', transactionType: 'GUESTFEE', chargeType: 'guest-fee', participantType: 'guest', facilityTypeId: null, isActive: true },
        { id: 'off', transactionType: 'OLD', chargeType: 'guest-fee', participantType: 'guest', facilityTypeId: 'BADMINTON', isActive: false },
    ];
    assert.equal(pricing.defaultTypeFor(types, { chargeType: 'facility-fee', participantType: 'member', facilityTypeId: 'BADMINTON' }).id, 'fee');
    assert.equal(pricing.defaultTypeFor(types, { chargeType: 'facility-fee', participantType: 'member', facilityTypeId: 'GYM' }).id, 'gen');
    assert.equal(pricing.defaultTypeFor(types, { chargeType: 'guest-fee', participantType: 'guest', facilityTypeId: 'BADMINTON' }).id, 'guestfee');
    assert.equal(pricing.defaultTypeFor(types, { chargeType: 'facility-fee', participantType: 'member', facilityTypeId: 'GYM', explicitId: 'guestfee' }).id, 'guestfee');
    assert.equal(pricing.defaultTypeFor(types, { chargeType: 'facility-fee', participantType: 'guest', facilityTypeId: 'GYM' }), null);
    assert.equal(pricing.bookerCategory({ patronType: 'member' }), 'member');
    assert.equal(pricing.bookerCategory({ patronType: 'other' }), 'guest');
});

// ---- slice 7b: a visiting member's entry fee ----

test('a visiting member is priced at their own cell of the card, and has no price until the club adds it', () => {
    const type = { transactionType: 'POOLFEE', chargeType: 'facility-fee' };
    const card = { effectiveDate: '2026-11-01', isActive: true, cells: [
        { participantType: 'member', dayScope: 'all', sessionId: null, amount: 10 },
        { participantType: 'reciprocal', dayScope: 'all', sessionId: null, amount: 25 },
        { participantType: 'reciprocal', dayScope: 'weekend', sessionId: null, amount: 30 },
    ] };
    const at = (participantType, dayType = 'weekday') => pricing.unitPriceOf(type, [card], { date: '2026-11-14', participantType, dayType });
    assert.deepEqual(at('member'), { unitAmount: 10 });
    assert.deepEqual(at('reciprocal'), { unitAmount: 25 });
    assert.deepEqual(at('reciprocal', 'weekend'), { unitAmount: 30 });
    // No cell is no price: never the member's price, never a silent zero.
    assert.match(at('affiliate').missing, /'POOLFEE' has no price for affiliate \/ weekday on 2026-11-14/);
});
