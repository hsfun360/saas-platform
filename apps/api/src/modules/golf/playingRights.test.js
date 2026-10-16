// Unit tests for the playing-right and round-quota pure rules.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';
const { test } = require('node:test');
const assert = require('node:assert');
const { periodWindow, rightAllows, pickQuota, rulesFor } = require('./playingRights.service');

const T = { playerTypeId: 't-member', membershipTypeId: 'mt-ordinary', affiliatedClubId: null };
const C = { playerTypeId: 't-aff', membershipTypeId: null, affiliatedClubId: 'club-1' };

test('periodWindow: ISO week, calendar month, calendar year', () => {
    assert.deepStrictEqual(periodWindow('week', '2026-10-15'), { from: '2026-10-12', to: '2026-10-18' });
    assert.deepStrictEqual(periodWindow('month', '2026-02-10'), { from: '2026-02-01', to: '2026-02-28' });
    assert.deepStrictEqual(periodWindow('year', '2026-10-15'), { from: '2026-01-01', to: '2026-12-31' });
});

test('rulesFor: club rules for a club target, type rules (refinement must match or be blank) otherwise', () => {
    const rules = [
        { id: 'a', playerTypeId: 't-member', membershipTypeId: null, affiliatedClubId: null },
        { id: 'b', playerTypeId: 't-member', membershipTypeId: 'mt-ordinary', affiliatedClubId: null },
        { id: 'c', playerTypeId: 't-member', membershipTypeId: 'mt-junior', affiliatedClubId: null },
        { id: 'd', playerTypeId: null, membershipTypeId: null, affiliatedClubId: 'club-1' },
    ];
    assert.deepStrictEqual(rulesFor(rules, T).map((r) => r.id), ['a', 'b']);
    assert.deepStrictEqual(rulesFor(rules, C).map((r) => r.id), ['d']);
    assert.deepStrictEqual(rulesFor(rules, { playerTypeId: 't-guest' }), []);
});

test('rightAllows: no rows = unrestricted; with rows the flight must fit one', () => {
    const flight = { courseId: 'E1', dayType: 'weekday', dayOfWeek: 'thursday', teeMinutes: 8 * 60, playDate: '2026-10-15' };
    assert.strictEqual(rightAllows([], T, flight), null);
    const weekdayMornings = [{ playerTypeId: 't-member', membershipTypeId: null, affiliatedClubId: null, courseId: null, dayScope: 'weekday', startTime: '07:00:00', endTime: '12:00:00', effectiveFrom: null, effectiveTo: null }];
    assert.strictEqual(rightAllows(weekdayMornings, T, flight), null);
    assert.match(rightAllows(weekdayMornings, T, { ...flight, teeMinutes: 13 * 60 }), /outside/);
    assert.match(rightAllows(weekdayMornings, T, { ...flight, dayType: 'weekend', dayOfWeek: 'saturday' }), /outside/);
    const dated = [{ ...weekdayMornings[0], startTime: null, endTime: null, dayScope: 'all', effectiveFrom: '2026-11-01', effectiveTo: null }];
    assert.match(rightAllows(dated, T, flight), /outside/);
    assert.strictEqual(rightAllows(dated, T, { ...flight, playDate: '2026-11-02' }), null);
    const courseOnly = [{ ...weekdayMornings[0], startTime: null, endTime: null, dayScope: 'all', courseId: 'W3' }];
    assert.match(rightAllows(courseOnly, T, flight), /outside/);
});

test('pickQuota: the most specific row wins - club > membership type > specific day > day type > all', () => {
    const rules = [
        { id: 'all', playerTypeId: 't-member', membershipTypeId: null, affiliatedClubId: null, dayScope: 'all', period: 'month', maxRounds: 8 },
        { id: 'wkd', playerTypeId: 't-member', membershipTypeId: null, affiliatedClubId: null, dayScope: 'weekend', period: 'month', maxRounds: 4 },
        { id: 'ord-sat', playerTypeId: 't-member', membershipTypeId: 'mt-ordinary', affiliatedClubId: null, dayScope: 'saturday', period: 'month', maxRounds: 2 },
    ];
    assert.strictEqual(pickQuota(rules, T, { dayType: 'weekday', dayOfWeek: 'monday' }).id, 'all');
    assert.strictEqual(pickQuota(rules, T, { dayType: 'weekend', dayOfWeek: 'sunday' }).id, 'wkd');
    assert.strictEqual(pickQuota(rules, T, { dayType: 'weekend', dayOfWeek: 'saturday' }).id, 'ord-sat');
    assert.strictEqual(pickQuota(rules, { ...T, membershipTypeId: 'mt-junior' }, { dayType: 'weekend', dayOfWeek: 'saturday' }).id, 'wkd');
    assert.strictEqual(pickQuota(rules, C, { dayType: 'weekday', dayOfWeek: 'monday' }), null);
});
