// Unit tests for the rain-check value and redemption rules (pure functions).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';
const { test } = require('node:test');
const assert = require('node:assert');
const { quoteValue, splitRedemption, expiryDateFor } = require('./rainCheck.service');

test('quoteValue prorates the basis by the unplayed holes', () => {
    const v = quoteValue({ basisAmount: 90, holesRegistered: 18, holesPlayed: 6, prorate: true });
    assert.strictEqual(v.computed, 60);
    assert.strictEqual(v.amount, 60);
    assert.deepStrictEqual([v.holesRegistered, v.holesPlayed], [18, 6]);
    assert.strictEqual(quoteValue({ basisAmount: 90, holesRegistered: 9, holesPlayed: 3, prorate: true }).computed, 60);
});

test('quoteValue without proration credits the whole basis', () => {
    assert.strictEqual(quoteValue({ basisAmount: 90, holesRegistered: 18, holesPlayed: 12, prorate: false }).amount, 90);
});

test('quoteValue clamps the holes and rounds to cents', () => {
    assert.strictEqual(quoteValue({ basisAmount: 100, holesRegistered: 18, holesPlayed: 25, prorate: true }).computed, 0);
    assert.strictEqual(quoteValue({ basisAmount: 100, holesRegistered: 18, holesPlayed: -3, prorate: true }).computed, 100);
    assert.strictEqual(quoteValue({ basisAmount: 100, holesRegistered: 18, holesPlayed: 5, prorate: true }).computed, 72.22);
});

test('quoteValue lets the desk lower the amount, never raise it', () => {
    assert.strictEqual(quoteValue({ basisAmount: 90, holesRegistered: 18, holesPlayed: 6, prorate: true, requestedAmount: '45' }).amount, 45);
    assert.match(quoteValue({ basisAmount: 90, holesRegistered: 18, holesPlayed: 6, prorate: true, requestedAmount: 61 }).error, /cannot exceed the computed value 60\.00/);
    assert.match(quoteValue({ basisAmount: 90, holesRegistered: 18, holesPlayed: 6, prorate: true, requestedAmount: -1 }).error, /0\.00 or more/);
});

test('splitRedemption is single use: the surplus is forfeited', () => {
    assert.deepStrictEqual(splitRedemption(60, 45), { applied: 45, forfeited: 15 });
    assert.deepStrictEqual(splitRedemption(60, 90), { applied: 60, forfeited: 0 });
    assert.deepStrictEqual(splitRedemption(60, 0), { applied: 0, forfeited: 60 });
});

test('expiryDateFor adds the validity days', () => {
    assert.strictEqual(expiryDateFor('2026-10-15', 90), '2027-01-13');
    assert.strictEqual(expiryDateFor('2026-12-31', 1), '2027-01-01');
});
