// Tests for the workflow engine's pure logic: step entry-condition evaluation.
// (State transitions are exercised end-to-end against the real DB; the
// condition evaluator is the part with silent-failure potential, so it gets
// exhaustive unit coverage.)

const { test } = require('node:test');
const assert = require('node:assert');
const { evalCondition } = require('./workflowEngine');

test('no condition (null / no field) always passes', () => {
    assert.equal(evalCondition(null, { amount: 5 }), true);
    assert.equal(evalCondition({}, { amount: 5 }), true);
});

test('missing context field evaluates false (step skipped, never stalls)', () => {
    assert.equal(evalCondition({ field: 'amount', op: 'gte', value: 10 }, {}), false);
    assert.equal(evalCondition({ field: 'amount', op: 'gte', value: 10 }, { amount: null }), false);
});

test('numeric comparison when both sides parse as numbers', () => {
    assert.equal(evalCondition({ field: 'amount', op: 'gte', value: 5000 }, { amount: 5000 }), true);
    assert.equal(evalCondition({ field: 'amount', op: 'gt', value: 5000 }, { amount: 5000 }), false);
    assert.equal(evalCondition({ field: 'amount', op: 'lt', value: '100' }, { amount: '99.5' }), true);
    // '9' < '10' numerically even though '9' > '10' as strings.
    assert.equal(evalCondition({ field: 'amount', op: 'lt', value: '10' }, { amount: '9' }), true);
});

test('string comparison when either side is non-numeric', () => {
    assert.equal(evalCondition({ field: 'membershipClass', op: 'eq', value: 'corporate' }, { membershipClass: 'corporate' }), true);
    assert.equal(evalCondition({ field: 'membershipClass', op: 'ne', value: 'corporate' }, { membershipClass: 'individual' }), true);
});

test('"in" matches against an array (or scalar) with loose string equality', () => {
    assert.equal(evalCondition({ field: 'membershipClass', op: 'in', value: ['individual', 'corporate'] }, { membershipClass: 'corporate' }), true);
    assert.equal(evalCondition({ field: 'membershipClass', op: 'in', value: ['individual'] }, { membershipClass: 'corporate' }), false);
    assert.equal(evalCondition({ field: 'amount', op: 'in', value: [100, 200] }, { amount: '200' }), true);
    assert.equal(evalCondition({ field: 'amount', op: 'in', value: 100 }, { amount: 100 }), true);
});

test('unknown operator evaluates false (misconfiguration never stalls)', () => {
    assert.equal(evalCondition({ field: 'amount', op: 'between', value: 5 }, { amount: 5 }), false);
});
