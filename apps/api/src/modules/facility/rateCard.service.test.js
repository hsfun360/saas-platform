const test = require('node:test');
const assert = require('node:assert/strict');
const { pickCard, resolveCell, normalizeCells } = require('./rateCard.service');

test('pickCard takes the latest active card effective on or before the date', () => {
    const cards = [
        { id: 'a', effectiveDate: '2026-01-01', isActive: true },
        { id: 'b', effectiveDate: '2026-11-01', isActive: true },
        { id: 'c', effectiveDate: '2026-12-01', isActive: true },
        { id: 'd', effectiveDate: '2026-06-01', isActive: false },
    ];
    assert.equal(pickCard(cards, '2026-11-15').id, 'b');
    assert.equal(pickCard(cards, '2026-11-01').id, 'b');
    assert.equal(pickCard(cards, '2026-07-01').id, 'a');
    assert.equal(pickCard(cards, '2025-12-31'), null);
});

test('resolveCell: exact session beats any session, exact day scope beats all, none = null', () => {
    const cells = [
        { participantType: 'member', dayScope: 'all', sessionId: null, amount: 10 },
        { participantType: 'member', dayScope: 'weekend', sessionId: null, amount: 15 },
        { participantType: 'member', dayScope: 'all', sessionId: 'evening', amount: 20 },
        { participantType: 'member', dayScope: 'weekend', sessionId: 'evening', amount: 25 },
        { participantType: 'guest', dayScope: 'all', sessionId: null, amount: 30 },
    ];
    assert.equal(resolveCell(cells, { participantType: 'member', dayType: 'weekday', sessionId: null }).amount, 10);
    assert.equal(resolveCell(cells, { participantType: 'member', dayType: 'weekend', sessionId: null }).amount, 15);
    assert.equal(resolveCell(cells, { participantType: 'member', dayType: 'weekday', sessionId: 'evening' }).amount, 20);
    assert.equal(resolveCell(cells, { participantType: 'member', dayType: 'weekend', sessionId: 'evening' }).amount, 25);
    assert.equal(resolveCell(cells, { participantType: 'member', dayType: 'weekend', sessionId: 'morning' }).amount, 15);
    assert.equal(resolveCell(cells, { participantType: 'guest', dayType: 'weekend', sessionId: 'evening' }).amount, 30);
    assert.equal(resolveCell(cells, { participantType: 'junior', dayType: 'weekday', sessionId: null }), null);
});

test('normalizeCells validates codes, scopes, sessions, amounts and duplicates', () => {
    const ctx = { knownParticipantCodes: new Set(['member', 'guest']), knownSessionIds: new Set(['s1']) };
    const ok = normalizeCells([
        { participantType: 'member', dayScope: 'all', sessionId: null, amount: '12.50' },
        { participantType: 'member', dayScope: 'weekend', sessionId: 's1', amount: 20 },
    ], ctx);
    assert.equal(ok.error, undefined);
    assert.deepEqual(ok.cells[0], { participantType: 'member', dayScope: 'all', sessionId: null, amount: 12.5 });
    assert.match(normalizeCells([], ctx).error, /at least one/);
    assert.match(normalizeCells([{ participantType: 'x', dayScope: 'all', amount: 1 }], ctx).error, /unknown participant/);
    assert.match(normalizeCells([{ participantType: 'member', dayScope: 'monday', amount: 1 }], ctx).error, /day scope/);
    assert.match(normalizeCells([{ participantType: 'member', dayScope: 'all', sessionId: 'nope', amount: 1 }], ctx).error, /session/);
    assert.match(normalizeCells([{ participantType: 'member', dayScope: 'all', amount: -1 }], ctx).error, /0\.00 or more/);
    assert.match(normalizeCells([
        { participantType: 'member', dayScope: 'all', amount: 1 },
        { participantType: 'member', dayScope: 'all', amount: 2 },
    ], ctx).error, /Duplicate/);
});
