const test = require('node:test');
const assert = require('node:assert/strict');
const { monthRange, standingOf } = require('./guestVisit.service');

test('monthRange spans the calendar month of the date, leap years included', () => {
    assert.deepEqual(monthRange('2026-11-14'), { from: '2026-11-01', to: '2026-11-30' });
    assert.deepEqual(monthRange('2028-02-10'), { from: '2028-02-01', to: '2028-02-29' });
    assert.deepEqual(monthRange('2026-12-31'), { from: '2026-12-01', to: '2026-12-31' });
    assert.equal(monthRange('bad'), null);
    assert.equal(monthRange('2026-13-01'), null);
});

test('standingOf: NULL allowance is no limit, zero is none, remaining never negative', () => {
    assert.deepEqual(standingOf(null, 3), { allowance: null, used: 3, remaining: null });
    assert.deepEqual(standingOf(0, 0), { allowance: 0, used: 0, remaining: 0 });
    assert.deepEqual(standingOf(4, 1), { allowance: 4, used: 1, remaining: 3 });
    assert.deepEqual(standingOf(2, 5), { allowance: 2, used: 5, remaining: 0 });
});
