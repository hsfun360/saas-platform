const test = require('node:test');
const assert = require('node:assert/strict');
const svc = require('./classScheduleRules.service');

test('weekday lists normalise to unique ISO days in order, anything else is refused', () => {
    assert.deepEqual(svc.normalizeWeekdays([3, '1', 3, 7]), [1, 3, 7]);
    assert.equal(svc.normalizeWeekdays([]), null);
    assert.equal(svc.normalizeWeekdays([0, 2]), null);
    assert.equal(svc.normalizeWeekdays(['x']), null);
});

test('a schedule expands onto its weekdays and skips public holidays when told to', () => {
    // 2 Nov 2026 is a Monday.
    const classified = [
        { date: '2026-11-02', dayType: 'weekday', isHoliday: false },
        { date: '2026-11-03', dayType: 'weekday', isHoliday: false },
        { date: '2026-11-04', dayType: 'weekend', isHoliday: true },
        { date: '2026-11-07', dayType: 'weekend', isHoliday: false },
        { date: '2026-11-09', dayType: 'weekday', isHoliday: false },
    ];
    const rows = svc.expandDates({ classified, weekdays: [1, 3], skipPublicHolidays: true });
    assert.deepEqual(rows.map((r) => [r.date, r.status, r.reason]), [
        ['2026-11-02', 'ok', null],
        ['2026-11-04', 'skipped', 'Public holiday'],
        ['2026-11-09', 'ok', null],
    ]);
    const kept = svc.expandDates({ classified, weekdays: [3], skipPublicHolidays: false });
    assert.deepEqual(kept.map((r) => [r.date, r.status, r.isHoliday]), [['2026-11-04', 'ok', true]]);
});

test('closures skip a whole day or an overlapping band only', () => {
    const rows = [
        { date: '2026-11-02', status: 'ok', reason: null },
        { date: '2026-11-09', status: 'ok', reason: null },
        { date: '2026-11-16', status: 'ok', reason: null },
        { date: '2026-11-23', status: 'skipped', reason: 'Public holiday' },
    ];
    const closed = new Map([
        ['2026-11-02', [{ start: null, end: null, label: 'Resurfacing' }]],
        ['2026-11-09', [{ start: 12 * 60, end: 14 * 60, label: 'Cleaning' }]],
        ['2026-11-16', [{ start: 9 * 60, end: 11 * 60, label: 'Tournament' }]],
    ]);
    const out = svc.applyClosures(rows, closed, { startTime: '10:00', endTime: '11:00' });
    assert.deepEqual(out.map((r) => [r.status, r.reason]), [
        ['skipped', 'Closed - Resurfacing'],
        ['ok', null],
        ['skipped', 'Closed - Tournament'],
        ['skipped', 'Public holiday'],
    ]);
});

test('conflicts: the venue first, then the court, a booking, the instructor; touching bands do not collide', () => {
    const rows = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'].map((date) => ({ date, status: 'ok', reason: null }));
    const taken = {
        venue: [{ date: '2026-11-02', start: 10 * 60, end: 11 * 60, label: 'YOGA 10:00-11:00' }],
        unit: [{ date: '2026-11-09', start: 9 * 60, end: 10 * 60 + 30, label: 'COACH 09:00-10:30' }],
        bookings: [{ date: '2026-11-16', start: 10 * 60, end: 11 * 60, label: 'FB-00012' }],
        instructor: [{ date: '2026-11-23', start: 11 * 60, end: 12 * 60, label: 'PILATES 11:00-12:00' }, { date: '2026-11-30', start: 10 * 60 + 30, end: 11 * 60 + 30, label: 'PILATES 10:30-11:30' }],
    };
    const out = svc.applyConflicts(rows, taken, { startTime: '10:00', endTime: '11:00' });
    assert.deepEqual(out.map((r) => [r.date, r.status, r.reason]), [
        ['2026-11-02', 'conflict', 'Venue taken by YOGA 10:00-11:00'],
        ['2026-11-09', 'conflict', 'Court taken by COACH 09:00-10:30'],
        ['2026-11-16', 'conflict', 'Booked - FB-00012'],
        ['2026-11-23', 'ok', null],
        ['2026-11-30', 'conflict', 'Instructor on PILATES 10:30-11:30'],
    ]);
    assert.deepEqual(svc.summarize(out), { ok: 1, skipped: 0, conflict: 4 });
});

test('the venue, instructor and capacity ladder: header, then class, capped by the venue', () => {
    const cls = { venueId: 'v1', instructorId: 'i1', capacity: 12 };
    const venue = { id: 'v1', capacity: 20 };
    assert.deepEqual(svc.resolveFacts({ cls, header: {}, venue }), { venueId: 'v1', instructorId: 'i1', capacity: 12 });
    assert.deepEqual(svc.resolveFacts({ cls, header: { venueId: 'v2', instructorId: 'i2', capacity: 8 }, venue: { id: 'v2', capacity: 10 } }), { venueId: 'v2', instructorId: 'i2', capacity: 8 });
    assert.deepEqual(svc.resolveFacts({ cls: { ...cls, capacity: null }, header: {}, venue }), { venueId: 'v1', instructorId: 'i1', capacity: 20 });
    assert.match(svc.resolveFacts({ cls: { ...cls, venueId: null }, header: {}, venue: null }).error, /Pick a venue/);
    assert.match(svc.resolveFacts({ cls: { ...cls, instructorId: null }, header: {}, venue }).error, /Pick an instructor/);
    assert.match(svc.resolveFacts({ cls, header: { capacity: 25 }, venue }).error, /exceeds the venue's 20/);
});

test('a venue blocks its unit only when the unit is a slot type', () => {
    assert.equal(svc.venueBlocksUnit({ Facility: { FacilityType: { usageMode: 'slot' } } }), true);
    assert.equal(svc.venueBlocksUnit({ Facility: { FacilityType: { usageMode: 'entry' } } }), false);
    assert.equal(svc.venueBlocksUnit({ Facility: null }), false);
    assert.equal(svc.venueBlocksUnit(null), false);
});

test('the class block covering a slot', () => {
    const blocks = [{ start: 9 * 60, end: 10 * 60 + 30, label: 'Coaching' }];
    assert.equal(svc.classBlockAt(blocks, 10 * 60, 11 * 60).label, 'Coaching');
    assert.equal(svc.classBlockAt(blocks, 11 * 60, 12 * 60), null);
    assert.equal(svc.classBlockAt(undefined, 0, 60), null);
});
