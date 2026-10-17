// Unit tests for the caddy register's pure rules (2026-10-17).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';
const { test } = require('node:test');
const assert = require('node:assert');
const { rangesOverlap, overlappingLeaves, onLeaveOn } = require('./caddy.service');

test('rangesOverlap: inclusive on both ends', () => {
    assert.strictEqual(rangesOverlap('2026-10-01', '2026-10-05', '2026-10-05', '2026-10-09'), true);
    assert.strictEqual(rangesOverlap('2026-10-01', '2026-10-05', '2026-10-06', '2026-10-09'), false);
    assert.strictEqual(rangesOverlap('2026-10-03', '2026-10-03', '2026-10-01', '2026-10-09'), true);
});

test('overlappingLeaves: finds the clash, ignores the row being edited', () => {
    const leaves = [
        { id: 'a', leaveType: 'annual', dateFrom: '2026-10-01', dateTo: '2026-10-05' },
        { id: 'b', leaveType: 'sick', dateFrom: '2026-10-20', dateTo: '2026-10-21' },
    ];
    assert.deepStrictEqual(overlappingLeaves(leaves, '2026-10-04', '2026-10-10').map((l) => l.id), ['a']);
    assert.deepStrictEqual(overlappingLeaves(leaves, '2026-10-04', '2026-10-10', 'a'), []);
    assert.deepStrictEqual(overlappingLeaves(leaves, '2026-10-06', '2026-10-19'), []);
});

test('onLeaveOn: a date inside any range', () => {
    const leaves = [{ dateFrom: '2026-10-01', dateTo: '2026-10-05' }];
    assert.strictEqual(onLeaveOn(leaves, '2026-10-05'), true);
    assert.strictEqual(onLeaveOn(leaves, '2026-10-06'), false);
    assert.strictEqual(onLeaveOn([], '2026-10-06'), false);
});
