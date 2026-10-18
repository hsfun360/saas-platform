// Unit tests for the buggy maintenance rules (2026-10-18): the inspection
// checklist normalisation, the faulty-system labels and which jobs park a unit.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';
const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeChecks, faultyLabels, parks } = require('./buggyMaintenance.service');

test('normalizeChecks: every system defaults to ok; only an explicit false is a fault', () => {
    assert.deepStrictEqual(normalizeChecks({}), { steeringOk: true, brakesOk: true, electricalOk: true, driveOk: true, bodyOk: true });
    assert.deepStrictEqual(normalizeChecks({ brakesOk: false, bodyOk: 'no' }), { steeringOk: true, brakesOk: false, electricalOk: true, driveOk: true, bodyOk: true });
    assert.deepStrictEqual(normalizeChecks(null).steeringOk, true);
});

test('faultyLabels: the five systems by label, in checklist order', () => {
    assert.deepStrictEqual(faultyLabels(normalizeChecks({ driveOk: false, steeringOk: false })), ['Steering', 'Drive']);
    assert.deepStrictEqual(faultyLabels(normalizeChecks({})), []);
});

test('parks: a service or repair parks the unit, an inspection does not', () => {
    assert.strictEqual(parks('service'), true);
    assert.strictEqual(parks('repair'), true);
    assert.strictEqual(parks('inspection'), false);
    assert.strictEqual(parks('nonsense'), false);
});
