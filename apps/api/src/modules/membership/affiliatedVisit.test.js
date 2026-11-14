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

// ---- letters that cover several days (2026-11-14) ----
const { daysBetween, lastDayOf, countedDays, capBreach, dateRangeText } = require('./affiliatedVisit.service');
const { receivableOn } = require('./registrationCounter.service');

test('a letter runs from its first day to its last, one day when no last day is given', () => {
    assert.deepStrictEqual(daysBetween('2026-11-14', '2026-11-16'), ['2026-11-14', '2026-11-15', '2026-11-16']);
    assert.deepStrictEqual(daysBetween('2026-11-30', '2026-12-01'), ['2026-11-30', '2026-12-01']);
    assert.strictEqual(lastDayOf({ visitDate: '2026-11-14', visitDateTo: null }), '2026-11-14');
    assert.strictEqual(lastDayOf({ visitDate: '2026-11-14', visitDateTo: '2026-11-16' }), '2026-11-16');
    assert.strictEqual(dateRangeText({ visitDate: '2026-11-14', visitDateTo: null }), '14 Nov 2026');
    assert.strictEqual(dateRangeText({ visitDate: '2026-11-14', visitDateTo: '2026-11-16' }), '14 Nov 2026 to 16 Nov 2026');
});

test('countedDays: each day counts - days to come are held, a missed day is given back', () => {
    const letter = { direction: 'inbound', visitDate: '2026-11-14', visitDateTo: '2026-11-16', arrivedOn: null };
    // Not yet arrived: every day still to come is held.
    assert.deepStrictEqual(countedDays({ ...letter, status: 'confirmed' }, [], '2026-11-10'), ['2026-11-14', '2026-11-15', '2026-11-16']);
    // The first day passed without the visitor: it is given back.
    assert.deepStrictEqual(countedDays({ ...letter, status: 'confirmed' }, [], '2026-11-15'), ['2026-11-15', '2026-11-16']);
    // Arrived on day 1, today is day 2 (not yet at the counter): day 1 attended, days 2 and 3 held.
    assert.deepStrictEqual(countedDays({ ...letter, status: 'arrived' }, ['2026-11-14'], '2026-11-15'), ['2026-11-14', '2026-11-15', '2026-11-16']);
    // Arrived on day 1, skipped day 2, today is day 3: day 2 is given back.
    assert.deepStrictEqual(countedDays({ ...letter, status: 'arrived' }, ['2026-11-14'], '2026-11-16'), ['2026-11-14', '2026-11-16']);
    // Completed: only the days attended.
    assert.deepStrictEqual(countedDays({ ...letter, status: 'completed' }, ['2026-11-14', '2026-11-16'], '2026-11-20'), ['2026-11-14', '2026-11-16']);
    // A letter that does not count at all.
    assert.deepStrictEqual(countedDays({ ...letter, status: 'cancelled' }, ['2026-11-14'], '2026-11-15'), []);
    assert.deepStrictEqual(countedDays({ ...letter, status: 'expired' }, [], '2026-11-20'), []);
});

test('countedDays: an outbound letter counts every day; an old received letter counts its arrival day', () => {
    assert.deepStrictEqual(
        countedDays({ direction: 'outbound', status: 'issued', visitDate: '2026-11-14', visitDateTo: '2026-11-15' }, [], '2026-12-01'),
        ['2026-11-14', '2026-11-15'],
    );
    // Received before the counter existed: no attended day on record.
    assert.deepStrictEqual(
        countedDays({ direction: 'inbound', status: 'completed', visitDate: '2026-10-16', visitDateTo: null, arrivedOn: '2026-10-16' }, [], '2026-11-14'),
        ['2026-10-16'],
    );
});

test('capBreach: the days of the letter are added to the days already counted in each calendar period', () => {
    const month = (d) => visitCapWindow('month', d);
    // 2 days used in November, the letter asks for 2 more, the arrangement allows 4: fits.
    assert.strictEqual(capBreach(['2026-11-14', '2026-11-15'], ['2026-11-02', '2026-11-03'], month, 4), null);
    // It allows 3: refused, with the numbers the message needs.
    const over = capBreach(['2026-11-14', '2026-11-15'], ['2026-11-02', '2026-11-03'], month, 3);
    assert.strictEqual(over.used, 2);
    assert.strictEqual(over.mine, 2);
    assert.strictEqual(over.window.from, '2026-11-01');
    // A letter across two months is judged in each: one day in November, two in December.
    assert.strictEqual(capBreach(['2026-11-30', '2026-12-01', '2026-12-02'], ['2026-12-10'], month, 3), null);
    assert.strictEqual(capBreach(['2026-11-30', '2026-12-01', '2026-12-02'], ['2026-12-10'], month, 2).window.from, '2026-12-01');
});

test('receivableOn: a letter is received on its own days, a one-day letter also on its alternate date', () => {
    const three = { visitDate: '2026-11-14', visitDateTo: '2026-11-16', alternateDate: null };
    assert.strictEqual(receivableOn(three, '2026-11-13'), false);
    assert.strictEqual(receivableOn(three, '2026-11-14'), true);
    assert.strictEqual(receivableOn(three, '2026-11-16'), true);
    assert.strictEqual(receivableOn(three, '2026-11-17'), false);
    const one = { visitDate: '2026-11-14', visitDateTo: null, alternateDate: '2026-11-21' };
    assert.strictEqual(receivableOn(one, '2026-11-14'), true);
    assert.strictEqual(receivableOn(one, '2026-11-21'), true);
    assert.strictEqual(receivableOn(one, '2026-11-15'), false);
});
