// Tests for the group booking lifecycle's pure policy (user decisions
// 2026-10-11): which status allows which action under each control mode, the
// refusal wording, and the deposit / club-local clock arithmetic. The
// transitions themselves run against the real DB and are exercised end-to-end.

const { test } = require('node:test');
const assert = require('node:assert');
const {
    abilities, guardMessage, requiredDepositOf, endOfDayInZone, zoneOffsetMinutes, holdExpiry, holdState,
    cellsOfDay, courseShare, shareExceeds, capFor, capCheck,
} = require('./groupLifecycle.service');

const ON = { controlOn: true, holdHours: 72, depositDays: 7, depositPct: 30 };
const OFF = { controlOn: false, holdHours: 72, depositDays: 7, depositPct: 30 };

test('control OFF: every live status behaves like the old booked, nothing times out', () => {
    for (const status of ['tentative', 'approved', 'booked']) {
        const can = abilities(status, OFF);
        assert.equal(can.editStructure, true, status);
        assert.equal(can.draw, true, status);
        assert.equal(can.deposit, true, status);
        assert.equal(can.cancel, true, status);
        assert.equal(can.reopen, false, status);
        assert.equal(can.extendDeposit, false, status);
    }
    assert.equal(abilities('cancelled', OFF).editStructure, false);
    assert.equal(abilities('cancelled', OFF).settle, true, 'a cancellation charge is still settled');
    assert.equal(holdExpiry(OFF), null);
});

test('control ON: tentative edits freely but cannot draw, deposit or print the proforma', () => {
    const can = abilities('tentative', ON);
    assert.equal(can.editStructure, true);
    assert.equal(can.editRoster, true);
    assert.equal(can.submit, true);
    assert.equal(can.draw, false);
    assert.equal(can.deposit, false);
    assert.equal(can.issueProforma, false);
    assert.equal(can.settle, false);
    assert.equal(can.reopen, false);
});

test('control ON: pending-approval is frozen except recall and cancel', () => {
    const can = abilities('pending-approval', ON);
    assert.equal(can.editStructure, false);
    assert.equal(can.editHeader, false);
    assert.equal(can.editRoster, false);
    assert.equal(can.recall, true);
    assert.equal(can.cancel, true);
    assert.equal(can.submit, false);
});

test('control ON: approved takes deposits and the proforma, not structure or the draw', () => {
    const can = abilities('approved', ON);
    assert.equal(can.deposit, true);
    assert.equal(can.issueProforma, true);
    assert.equal(can.editRoster, true);
    assert.equal(can.editStructure, false);
    assert.equal(can.draw, false);
    assert.equal(can.reopen, true);
    assert.equal(can.extendDeposit, true);
    assert.equal(abilities('approved', { ...ON, depositDueExtendedAt: new Date() }).extendDeposit, false, 'one extension only');
});

test('control ON: booked (confirmed) draws and settles, structure needs a reopen', () => {
    const can = abilities('booked', ON);
    assert.equal(can.draw, true);
    assert.equal(can.settle, true);
    assert.equal(can.deposit, true);
    assert.equal(can.editStructure, false);
    assert.equal(can.reopen, true);
    assert.equal(can.cancel, true);
});

test('lapsed and cancelled: read-only, except the money still has to go somewhere', () => {
    for (const status of ['lapsed', 'cancelled']) {
        const can = abilities(status, ON);
        assert.equal(can.editStructure, false, status);
        assert.equal(can.editRoster, false, status);
        assert.equal(can.cancel, false, status);
        assert.equal(can.settle, true, status);
    }
    assert.equal(abilities('lapsed', ON).reopen, true, 'a lapsed booking is revived by reopening');
    assert.equal(abilities('cancelled', ON).reopen, false);
});

test('guardMessage names the state and the way forward', () => {
    assert.equal(guardMessage({ status: 'tentative' }, ON, 'structure'), null);
    assert.match(guardMessage({ status: 'pending-approval' }, ON, 'structure'), /recall/);
    assert.match(guardMessage({ status: 'approved' }, ON, 'structure'), /reopen/);
    assert.match(guardMessage({ status: 'tentative' }, ON, 'deposit'), /approved/);
    assert.match(guardMessage({ status: 'tentative' }, ON, 'draw'), /confirmed/);
    assert.match(guardMessage({ status: 'lapsed' }, ON, 'roster'), /lapsed/);
    assert.match(guardMessage({ status: 'cancelled' }, OFF, 'structure'), /cancelled/);
});

test('hold state labels: every unconfirmed live status is named, confirmed is not', () => {
    assert.equal(holdState('tentative'), 'TENTATIVE');
    assert.equal(holdState('pending-approval'), 'PENDING');
    assert.equal(holdState('approved'), 'APPROVED');
    assert.equal(holdState('booked'), null);
});

test('required deposit: the proforma figure wins, else the default percentage, 0 without a bill', () => {
    assert.equal(requiredDepositOf(null, ON), 0);
    assert.equal(requiredDepositOf({ totalAmount: '1000.00', depositRequired: null }, ON), 300);
    assert.equal(requiredDepositOf({ totalAmount: '1000.00', depositRequired: '450.00' }, ON), 450);
    assert.equal(requiredDepositOf({ totalAmount: '1000.00', depositRequired: 0 }, ON), 0, 'an explicit zero means no deposit');
    assert.equal(requiredDepositOf({ totalAmount: '999.99', depositRequired: null }, { ...ON, depositPct: 33 }), 330);
});

test('hold expiry: hours from now while the control is on, none for 0 hours', () => {
    const from = new Date('2026-10-11T02:00:00Z');
    assert.equal(holdExpiry(ON, from).toISOString(), '2026-10-14T02:00:00.000Z');
    assert.equal(holdExpiry({ ...ON, holdHours: 0 }, from), null);
});

// ---- share caps (2026-10-11) ----

const slots = (times) => times.map((teeTime) => ({ teeTime }));
const GRID = slots(['07:00', '07:08', '07:16', '07:24', '07:32', '07:40', '07:48', '07:56', '08:04', '08:12']); // 10 cells

test('cellsOfDay: flights on a sequential day, the hold window on a shotgun day', () => {
    assert.equal(cellsOfDay({ startFormat: 'traditional' }, 3, GRID), 3);
    assert.equal(cellsOfDay({ startFormat: 'shotgun', startTime: '07:00', blockUntil: '07:30' }, 18, GRID), 4, 'four slots inside 07:00-07:30');
    assert.equal(cellsOfDay({ startFormat: 'shotgun', startTime: '07:00', blockUntil: null }, 18, GRID), 10, 'no end = the rest of the day');
    assert.equal(cellsOfDay({ startFormat: 'modified-shotgun', startTime: '07:00', blockUntil: '07:30' }, 5, []), 0, 'no grid, no cells');
});

function ctxWith(days, flights) {
    return {
        byCourse: new Map([['C1', { slots: GRID }]]),
        holds: { days, flights },
    };
}

test('courseShare counts every live group on the course except club events and the excluded booking', () => {
    const ctx = ctxWith([
        { day: { id: 'd1', courseId: 'C1', startFormat: 'traditional' }, profile: { id: 'A', isClubEvent: false } },
        { day: { id: 'd2', courseId: 'C1', startFormat: 'shotgun', startTime: '07:00', blockUntil: '07:16' }, profile: { id: 'B', isClubEvent: false } },
        { day: { id: 'd3', courseId: 'C1', startFormat: 'traditional' }, profile: { id: 'M', isClubEvent: true } },
        { day: { id: 'd4', courseId: 'C2', startFormat: 'traditional' }, profile: { id: 'X', isClubEvent: false } },
    ], [
        { groupPlayDayId: 'd1' }, { groupPlayDayId: 'd1' }, // A: 2 flights
        { groupPlayDayId: 'd3' }, { groupPlayDayId: 'd3' }, { groupPlayDayId: 'd3' }, // club event: ignored
        { groupPlayDayId: 'd4' }, // another course: ignored
    ]);
    const share = courseShare(ctx, 'C1');
    assert.deepEqual(share, { slots: 10, groupCells: 4, groupSharePct: 40 }, 'A 2 + B 2 window cells');
    assert.equal(courseShare(ctx, 'C1', { excludeBookingId: 'A' }).groupCells, 2);
});

test('shareExceeds: null within the cap or with no cap, the resulting share past it', () => {
    assert.equal(shareExceeds({ newCells: 2, groupCells: 2, slots: 10, capPct: 40 }), null);
    assert.equal(shareExceeds({ newCells: 3, groupCells: 2, slots: 10, capPct: 40 }), 50);
    assert.equal(shareExceeds({ newCells: 9, groupCells: 2, slots: 10, capPct: 0 }), null, 'cap 0 = no cap');
    assert.equal(shareExceeds({ newCells: 9, groupCells: 2, slots: 0, capPct: 10 }), null, 'no grid, nothing to cap');
});

test('capFor picks the cap by day type', () => {
    const setting = { capWeekday: 50, capWeekend: 20 };
    assert.equal(capFor(setting, 'weekday'), 50);
    assert.equal(capFor(setting, 'weekend'), 20);
});

test('capCheck refuses past the cap with the share and the cap in the message', () => {
    const setting = { capWeekday: 50, capWeekend: 20 };
    const ctx = ctxWith([
        { day: { id: 'd1', courseId: 'C1', startFormat: 'traditional' }, profile: { id: 'A', isClubEvent: false } },
    ], [{ groupPlayDayId: 'd1' }, { groupPlayDayId: 'd1' }]);
    const day = { courseId: 'C1', startFormat: 'traditional', playDate: '2026-11-21' };
    const course = { courseCode: 'E1' };
    const refused = capCheck({ profile: { id: 'B', isClubEvent: false }, day, course, ctx, newCells: 2, dayType: 'weekend', setting });
    assert.ok(refused && /40% of E1's tee times on 2026-11-21 - the weekend cap is 20% \(20% held by other groups already\)/.test(refused.fail), refused && refused.fail);
    assert.equal(capCheck({ profile: { id: 'B', isClubEvent: false }, day, course, ctx, newCells: 2, dayType: 'weekday', setting }), null, 'within the 50% weekday cap');
    assert.equal(capCheck({ profile: { id: 'M', isClubEvent: true }, day, course, ctx, newCells: 8, dayType: 'weekend', setting }), null, 'club events are exempt');
    assert.equal(capCheck({ profile: { id: 'A', isClubEvent: false }, day, course, ctx, newCells: 2, dayType: 'weekend', setting }), null, 'own old flights are excluded: 0 + 2 of 10 = 20%');
});

test('club-local end of day: Kuala Lumpur (UTC+8) ends 15:59:59Z, UTC ends at 23:59:59Z', () => {
    assert.equal(zoneOffsetMinutes(new Date('2026-10-11T00:00:00Z'), 'Asia/Kuala_Lumpur'), 480);
    assert.equal(endOfDayInZone('2026-10-18', 'Asia/Kuala_Lumpur').toISOString(), '2026-10-18T15:59:59.000Z');
    assert.equal(endOfDayInZone('2026-10-18', 'UTC').toISOString(), '2026-10-18T23:59:59.000Z');
});
