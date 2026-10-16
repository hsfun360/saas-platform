// Unit tests for the affiliated-visit pure rules.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';
const { test } = require('node:test');
const assert = require('node:assert');
const { visitCapWindow, facilitiesText } = require('./affiliatedVisit.service');

test('visitCapWindow: an ISO week runs Monday to Sunday', () => {
    assert.deepStrictEqual(visitCapWindow('week', '2026-10-15'), { from: '2026-10-12', to: '2026-10-18' }); // Thursday
    assert.deepStrictEqual(visitCapWindow('week', '2026-10-18'), { from: '2026-10-12', to: '2026-10-18' }); // Sunday stays in its week
});

test('visitCapWindow: calendar month and year', () => {
    assert.deepStrictEqual(visitCapWindow('month', '2026-02-10'), { from: '2026-02-01', to: '2026-02-28' });
    assert.deepStrictEqual(visitCapWindow('year', '2026-10-15'), { from: '2026-01-01', to: '2026-12-31' });
    assert.deepStrictEqual(visitCapWindow('nonsense', '2026-10-15'), { from: '2026-01-01', to: '2026-12-31' });
});

test('facilitiesText reads the request as one sentence, golf optional', () => {
    const f = { golf: { holes: 18, teeTime: '08:04', courseId: 'x' }, dining: 'lunch for 3', accommodation: null, sports: 'tennis court', other: '' };
    assert.strictEqual(facilitiesText(f), 'Golf: 18 holes at 08:04; Dining: lunch for 3; Sports: tennis court');
    assert.strictEqual(facilitiesText(f, { golf: false }), 'Dining: lunch for 3; Sports: tennis court');
    assert.strictEqual(facilitiesText({ golf: null }), '');
});
