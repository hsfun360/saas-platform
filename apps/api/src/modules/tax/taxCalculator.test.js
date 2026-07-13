const { test } = require('node:test');
const assert = require('node:assert');
const { computeTax, round2 } = require('./taxCalculator');

// Compare 2dp money values with a tiny tolerance against float dust.
const eq = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: expected ${b}, got ${a}`);
const comp = (taxCode, taxRate, taxPriority, extra = {}) => ({ taxCode, taxRate, taxPriority, isClaimable: false, claimPercentage: 0, ...extra });
const lineOf = (res, code) => res.lines.find((l) => l.taxCode === code);

// ---- round2: half-up, float-safe ----
test('round2 rounds half-up and survives float representation', () => {
    eq(round2(2.925), 2.93, '2.925');
    eq(round2(7.408), 7.41, '7.408');
    eq(round2(2.9328), 2.93, '2.9328');
    eq(round2(13.965), 13.97, '13.965');
    eq(round2(10.7534), 10.75, '10.7534');
    eq(round2(5.586), 5.59, '5.586');
});

// ---- EXCLUSIVE cascade (ascending, tax-on-tax) ----
test('exclusive: single tier two components + third tier (SC 10% p1, SST 8% p2) base 100', () => {
    const r = computeTax({ amount: 100, ieFlag: 'EXCLUSIVE', components: [comp('SC', 10, 1), comp('SST', 8, 2)] });
    eq(r.net, 100, 'net');
    eq(lineOf(r, 'SC').taxAmount, 10.0, 'SC');
    eq(lineOf(r, 'SST').taxAmount, 8.8, 'SST'); // taxes 110
    eq(r.taxTotal, 18.8, 'taxTotal');
    eq(r.gross, 118.8, 'gross');
});

test('exclusive: three tiers A10 p1 / B5 p2 / C6 p3 base 100', () => {
    const r = computeTax({ amount: 100, ieFlag: 'EXCLUSIVE', components: [comp('A', 10, 1), comp('B', 5, 2), comp('C', 6, 3)] });
    eq(lineOf(r, 'A').taxAmount, 10.0, 'A');
    eq(lineOf(r, 'B').taxAmount, 5.5, 'B'); // taxes 110
    eq(lineOf(r, 'C').taxAmount, 6.93, 'C'); // taxes 115.50
    eq(r.gross, 122.43, 'gross');
});

test('exclusive: rounding case base 33.33 (SC 10 p1, SST 8 p2)', () => {
    const r = computeTax({ amount: 33.33, ieFlag: 'EXCLUSIVE', components: [comp('SC', 10, 1), comp('SST', 8, 2)] });
    eq(lineOf(r, 'SC').taxAmount, 3.33, 'SC'); // round2(3.333)
    eq(lineOf(r, 'SST').taxAmount, 2.93, 'SST'); // 8% of 36.66
    eq(r.gross, 39.59, 'gross');
});

test('exclusive: tied priority parallel - two 10% at p1, 8% at p2 base 100', () => {
    const r = computeTax({ amount: 100, ieFlag: 'EXCLUSIVE', components: [comp('A', 10, 1), comp('B', 10, 1), comp('C', 8, 2)] });
    eq(lineOf(r, 'A').taxAmount, 10.0, 'A');
    eq(lineOf(r, 'B').taxAmount, 10.0, 'B'); // parallel: both tax 100
    eq(lineOf(r, 'C').taxAmount, 9.6, 'C'); // 8% of 120
    eq(r.gross, 129.6, 'gross');
});

test('exclusive: tied priority at p2 - 10 p1, (10 + 8) p2 base 100', () => {
    const r = computeTax({ amount: 100, ieFlag: 'EXCLUSIVE', components: [comp('A', 10, 1), comp('B', 10, 2), comp('C', 8, 2)] });
    eq(lineOf(r, 'A').taxAmount, 10.0, 'A');
    eq(lineOf(r, 'B').taxAmount, 11.0, 'B'); // both p2 tax 110
    eq(lineOf(r, 'C').taxAmount, 8.8, 'C');
    eq(r.gross, 129.8, 'gross');
});

// ---- EXCLUSIVE on RM133 (fresh setups) ----
test('exclusive RM133: single A 6%', () => {
    const r = computeTax({ amount: 133, ieFlag: 'EXCLUSIVE', components: [comp('A', 6, 1)] });
    eq(lineOf(r, 'A').taxAmount, 7.98, 'A');
    eq(r.gross, 140.98, 'gross');
});

test('exclusive RM133: SC 10 p1, ST 6 p2', () => {
    const r = computeTax({ amount: 133, ieFlag: 'EXCLUSIVE', components: [comp('SC', 10, 1), comp('ST', 6, 2)] });
    eq(lineOf(r, 'SC').taxAmount, 13.3, 'SC');
    eq(lineOf(r, 'ST').taxAmount, 8.78, 'ST'); // 6% of 146.30
    eq(r.gross, 155.08, 'gross');
});

test('exclusive RM133: A5 p1 / B10 p2 / C7 p3', () => {
    const r = computeTax({ amount: 133, ieFlag: 'EXCLUSIVE', components: [comp('A', 5, 1), comp('B', 10, 2), comp('C', 7, 3)] });
    eq(lineOf(r, 'A').taxAmount, 6.65, 'A');
    eq(lineOf(r, 'B').taxAmount, 13.97, 'B'); // round2(13.965)
    eq(lineOf(r, 'C').taxAmount, 10.75, 'C');
    eq(r.gross, 164.37, 'gross');
});

test('exclusive RM133: (A6 + B4) p1, C8 p2', () => {
    const r = computeTax({ amount: 133, ieFlag: 'EXCLUSIVE', components: [comp('A', 6, 1), comp('B', 4, 1), comp('C', 8, 2)] });
    eq(lineOf(r, 'A').taxAmount, 7.98, 'A');
    eq(lineOf(r, 'B').taxAmount, 5.32, 'B');
    eq(lineOf(r, 'C').taxAmount, 11.7, 'C'); // 8% of 146.30
    eq(r.gross, 158.0, 'gross');
});

// ---- INCLUSIVE (Option B: clean net, residual on largest top-tier line) ----
test('inclusive: exact back-out of gross 118.80 (SC10 p1, SST8 p2)', () => {
    const r = computeTax({ amount: 118.8, ieFlag: 'INCLUSIVE', components: [comp('SC', 10, 1), comp('SST', 8, 2)] });
    eq(r.net, 100, 'net');
    eq(lineOf(r, 'SC').taxAmount, 10.0, 'SC');
    eq(lineOf(r, 'SST').taxAmount, 8.8, 'SST');
    eq(r.gross, 118.8, 'gross');
});

test('inclusive: three tiers gross 122.43 back to net 100', () => {
    const r = computeTax({ amount: 122.43, ieFlag: 'INCLUSIVE', components: [comp('A', 10, 1), comp('B', 5, 2), comp('C', 6, 3)] });
    eq(r.net, 100, 'net');
    eq(lineOf(r, 'A').taxAmount, 10.0, 'A');
    eq(lineOf(r, 'B').taxAmount, 5.5, 'B');
    eq(lineOf(r, 'C').taxAmount, 6.93, 'C');
});

test('inclusive Option B: gross 39.59 -> net 33.32 (clean net rounds down), residual on SST', () => {
    // Option B: net = round2(39.59 / 1.188) = round2(33.3249) = 33.32 (NOT the peel value 33.33).
    // Forward gives 39.58; residual +0.01 lands on SST (2.93 -> 2.94).
    const r = computeTax({ amount: 39.59, ieFlag: 'INCLUSIVE', components: [comp('SC', 10, 1), comp('SST', 8, 2)] });
    eq(r.net, 33.32, 'net (clean)');
    eq(lineOf(r, 'SC').taxAmount, 3.33, 'SC');
    eq(lineOf(r, 'SST').taxAmount, 2.94, 'SST (absorbs +0.01)');
    eq(r.gross, 39.59, 'gross ties');
});

test('inclusive Option B: gross 100 -> net 84.18, residual on last (SST 7.40)', () => {
    const r = computeTax({ amount: 100, ieFlag: 'INCLUSIVE', components: [comp('SC', 10, 1), comp('SST', 8, 2)] });
    eq(r.net, 84.18, 'net (clean)');
    eq(lineOf(r, 'SC').taxAmount, 8.42, 'SC');
    eq(lineOf(r, 'SST').taxAmount, 7.4, 'SST (absorbs -0.01)');
    eq(r.gross, 100, 'gross ties');
});

test('inclusive Option B RM133: SC10 p1, ST6 p2 -> net 114.07, ST 7.52', () => {
    const r = computeTax({ amount: 133, ieFlag: 'INCLUSIVE', components: [comp('SC', 10, 1), comp('ST', 6, 2)] });
    eq(r.net, 114.07, 'net');
    eq(lineOf(r, 'SC').taxAmount, 11.41, 'SC');
    eq(lineOf(r, 'ST').taxAmount, 7.52, 'ST (absorbs -0.01)');
    eq(r.gross, 133, 'gross ties');
});

test('inclusive RM133: single A 6% -> net 125.47', () => {
    const r = computeTax({ amount: 133, ieFlag: 'INCLUSIVE', components: [comp('A', 6, 1)] });
    eq(r.net, 125.47, 'net');
    eq(lineOf(r, 'A').taxAmount, 7.53, 'A');
    eq(r.gross, 133, 'gross');
});

test('inclusive RM133: (A6 + B4) p1, C8 p2 -> net 111.95', () => {
    const r = computeTax({ amount: 133, ieFlag: 'INCLUSIVE', components: [comp('A', 6, 1), comp('B', 4, 1), comp('C', 8, 2)] });
    eq(r.net, 111.95, 'net');
    eq(lineOf(r, 'A').taxAmount, 6.72, 'A');
    eq(lineOf(r, 'B').taxAmount, 4.48, 'B');
    eq(lineOf(r, 'C').taxAmount, 9.85, 'C');
    eq(r.gross, 133, 'gross');
});

test('inclusive: residual lands on the LARGEST line of the top tier', () => {
    // gross 100; p1 A10; p2 B10 + C8. Forward gives 99.99, residual +0.01 -> B (10% > 8%).
    const r = computeTax({ amount: 100, ieFlag: 'INCLUSIVE', components: [comp('A', 10, 1), comp('B', 10, 2), comp('C', 8, 2)] });
    eq(r.net, 77.04, 'net');
    eq(lineOf(r, 'A').taxAmount, 7.7, 'A');
    eq(lineOf(r, 'B').taxAmount, 8.48, 'B (largest in top tier, absorbs +0.01)');
    eq(lineOf(r, 'C').taxAmount, 6.78, 'C');
    eq(r.gross, 100, 'gross ties');
});

// ---- Claimable (output-only split) ----
test('claimable: full 100% on input tax', () => {
    const r = computeTax({ amount: 100, ieFlag: 'EXCLUSIVE', components: [comp('TX', 8, 1, { isClaimable: true, claimPercentage: 100 })] });
    const tx = lineOf(r, 'TX');
    eq(tx.taxAmount, 8.0, 'tax');
    eq(tx.claimableAmount, 8.0, 'claimable');
    eq(tx.nonClaimableAmount, 0.0, 'nonclaim');
    eq(r.gross, 108, 'gross unaffected');
});

test('claimable: partial 50%', () => {
    const r = computeTax({ amount: 100, ieFlag: 'EXCLUSIVE', components: [comp('TX', 8, 1, { isClaimable: true, claimPercentage: 50 })] });
    const tx = lineOf(r, 'TX');
    eq(tx.claimableAmount, 4.0, 'claimable');
    eq(tx.nonClaimableAmount, 4.0, 'nonclaim');
});

test('claimable: partial with rounding - base 133, 6%, claim 70%', () => {
    const r = computeTax({ amount: 133, ieFlag: 'EXCLUSIVE', components: [comp('TX', 6, 1, { isClaimable: true, claimPercentage: 70 })] });
    const tx = lineOf(r, 'TX');
    eq(tx.taxAmount, 7.98, 'tax');
    eq(tx.claimableAmount, 5.59, 'claimable = round2(5.586)');
    eq(tx.nonClaimableAmount, 2.39, 'nonclaim balances');
});

test('claimable: two-tier input cascade with mixed claim %', () => {
    const r = computeTax({
        amount: 100, ieFlag: 'EXCLUSIVE',
        components: [comp('TX1', 10, 1, { isClaimable: true, claimPercentage: 100 }), comp('TX2', 8, 2, { isClaimable: true, claimPercentage: 50 })],
    });
    eq(r.taxTotal, 18.8, 'taxTotal');
    eq(r.claimableTotal, 14.4, 'claimableTotal (10.00 + 4.40)');
    eq(r.nonClaimableTotal, 4.4, 'nonClaimableTotal');
});

// ---- Edge cases ----
test('no components: amount is both net and gross', () => {
    const r = computeTax({ amount: 100, ieFlag: 'EXCLUSIVE', components: [] });
    eq(r.net, 100, 'net');
    eq(r.taxTotal, 0, 'tax');
    eq(r.gross, 100, 'gross');
});

test('zero-rate component contributes no tax', () => {
    const r = computeTax({ amount: 100, ieFlag: 'EXCLUSIVE', components: [comp('ZR', 0, 1)] });
    eq(r.taxTotal, 0, 'tax');
    eq(r.gross, 100, 'gross');
});
