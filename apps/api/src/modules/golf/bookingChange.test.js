// Unit tests for the change-booking policy and summary (pure functions).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test';
const { test } = require('node:test');
const assert = require('node:assert');
const { policy, summarize, changeTypeOf, sameFlight } = require('./bookingChange.service');

const charge = { noticeHours: 24, lateAction: 'charge', basis: 'player' };
const chargeBooking = { noticeHours: 24, lateAction: 'charge', basis: 'booking' };
const refuse = { noticeHours: 24, lateAction: 'refuse', basis: 'player' };
const a = { playerName: 'A', status: 'booked' };
const b = { playerName: 'B', status: 'booked' };
const c = { playerName: 'C', status: 'booked' };

test('policy: control off or outside the window - every change is free', () => {
    assert.deepStrictEqual(policy({ cfg: null, late: true, movedDay: true, keptBooked: [a], dropped: [b] }).quantity, 0);
    assert.strictEqual(policy({ cfg: charge, late: false, movedDay: true, keptBooked: [a], dropped: [b] }).free, true);
});

test('policy: same-day move inside the window is free, dropped players are charged per player', () => {
    const r = policy({ cfg: charge, late: true, movedDay: false, keptBooked: [a, b], dropped: [c] });
    assert.strictEqual(r.refusal, null);
    assert.strictEqual(r.quantity, 1);
    assert.deepStrictEqual(r.chargedPlayers.map((p) => p.playerName), ['C']);
    const move = policy({ cfg: charge, late: true, movedDay: false, keptBooked: [a, b], dropped: [] });
    assert.strictEqual(move.free, true);
});

test('policy: another-day move inside the window charges every booked player of the original flight', () => {
    const r = policy({ cfg: charge, late: true, movedDay: true, keptBooked: [a, b], dropped: [c] });
    assert.strictEqual(r.quantity, 3);
    assert.deepStrictEqual(r.chargedPlayers.map((p) => p.playerName), ['A', 'B', 'C']);
});

test('policy: per-booking basis charges once on a day move and nothing on a partial drop', () => {
    assert.strictEqual(policy({ cfg: chargeBooking, late: true, movedDay: true, keptBooked: [a], dropped: [] }).quantity, 1);
    const partial = policy({ cfg: chargeBooking, late: true, movedDay: false, keptBooked: [a], dropped: [b] });
    assert.strictEqual(partial.quantity, 0);
    assert.strictEqual(partial.free, true);
});

test('policy: refuse mode blocks day moves and drops but allows a same-day move', () => {
    assert.match(policy({ cfg: refuse, late: true, movedDay: true, keptBooked: [a], dropped: [] }).refusal, /another day/);
    assert.match(policy({ cfg: refuse, late: true, movedDay: false, keptBooked: [a], dropped: [b] }).refusal, /drop players/);
    assert.strictEqual(policy({ cfg: refuse, late: true, movedDay: false, keptBooked: [a], dropped: [] }).refusal, null);
});

test('summary names the move, the roster change and the charge in one sentence', () => {
    const before = { playDate: '2026-10-24', teeTime: '07:15', courseCode: 'E1', holes: 18 };
    const after = { playDate: '2026-10-24', teeTime: '08:30', courseCode: 'E2', holes: 18 };
    const s = summarize({
        before, after, moved: true, added: [{ playerName: 'New Guy' }], dropped: [c], headerChanged: true,
        priced: { totalAmount: 84, quantity: 1, unitAmount: 80, taxAmount: 4 }, policyResult: { quantity: 1 },
    });
    assert.match(s, /^Moved from 24 Oct 2026 07:15 \(E1, 18 holes\) to 24 Oct 2026 08:30 \(E2, 18 holes\); 1 player\(s\) added: New Guy; 1 player\(s\) dropped: C; contact details \/ remarks updated; late-change charge 84\.00 \(1 x 80\.00 \+ 4\.00 tax\)\.$/);
    assert.strictEqual(summarize({ before, after, moved: false, added: [], dropped: [], headerChanged: true, priced: null, policyResult: { quantity: 0 } }), 'Contact details / remarks updated.');
});

test('changeType and sameFlight', () => {
    assert.strictEqual(changeTypeOf({ moved: true, rosterChanged: false, headerChanged: false }), 'move');
    assert.strictEqual(changeTypeOf({ moved: false, rosterChanged: true, headerChanged: false }), 'roster');
    assert.strictEqual(changeTypeOf({ moved: false, rosterChanged: false, headerChanged: true }), 'header');
    assert.strictEqual(changeTypeOf({ moved: true, rosterChanged: true, headerChanged: false }), 'mixed');
    const f = { courseId: 'c', playDate: '2026-10-24', teeTime: '07:15', holes: 18 };
    assert.strictEqual(sameFlight(f, { ...f }), true);
    assert.strictEqual(sameFlight(f, { ...f, holes: 9 }), false);
});
