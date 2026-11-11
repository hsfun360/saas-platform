const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('./utilityRules.service');

test('the behaviour of an item follows its two switches', () => {
    assert.equal(rules.behaviourOf({ trackUnits: true, returnRequired: true }), 'units');
    assert.equal(rules.behaviourOf({ trackUnits: false, returnRequired: true }), 'quantity');
    assert.equal(rules.behaviourOf({ trackUnits: false, returnRequired: false }), 'use');
    // Numbered units are always returned, whatever the second switch says.
    assert.equal(rules.behaviourOf({ trackUnits: true, returnRequired: false }), 'units');
});

test('normalising the switches: units are always returned and carry no stock, a use is never due back', () => {
    assert.deepEqual(rules.normalizeBehaviour({ trackUnits: true, returnRequired: false, stockQuantity: 50, dueDays: 2 }), { trackUnits: true, returnRequired: true, stockQuantity: null, dueDays: 2 });
    assert.deepEqual(rules.normalizeBehaviour({ trackUnits: false, returnRequired: true, stockQuantity: 200, dueDays: 1 }), { trackUnits: false, returnRequired: true, stockQuantity: 200, dueDays: 1 });
    assert.deepEqual(rules.normalizeBehaviour({ trackUnits: false, returnRequired: false, stockQuantity: 200, dueDays: 3 }), { trackUnits: false, returnRequired: false, stockQuantity: null, dueDays: 0 });
});

test('generate units: prefix and padded numbers, existing codes flagged, bounds refused', () => {
    const out = rules.generateUnitCodes({ prefix: 'l', from: 1, to: 3, pad: 3, existing: ['L002'] });
    assert.deepEqual(out.codes, [{ code: 'L001', exists: false }, { code: 'L002', exists: true }, { code: 'L003', exists: false }]);
    assert.equal(out.fresh, 2);
    // The default width is the width of the last number.
    assert.deepEqual(rules.generateUnitCodes({ prefix: 'A', from: 9, to: 10 }).codes.map((c) => c.code), ['A09', 'A10']);
    assert.ok(rules.generateUnitCodes({ prefix: 'L', from: 5, to: 1 }).error);
    assert.ok(rules.generateUnitCodes({ prefix: 'L', from: 1, to: 600 }).error);
    assert.ok(rules.generateUnitCodes({ prefix: 'bad prefix', from: 1, to: 2 }).error);
    assert.ok(rules.generateUnitCodes({ prefix: 'ABCDEFGHIJKL', from: 1, to: 2, pad: 6 }).codes);
    assert.ok(rules.generateUnitCodes({ prefix: 'L', from: 1, to: 2, pad: 9 }).error);
});
