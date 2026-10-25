const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('./bookingRules.service');

const setting = {
    advanceBookingDays: 7, advanceBookingHours: 2, allowSameDayBooking: false, allowMembershipTypeOverride: true,
    guestControlEnabled: true, allowGuestWeekday: true, allowMemberGuestWeekday: true, allowGuestWeekend: false, allowMemberGuestWeekend: true,
    noShowControlEnabled: true, cancellationNoticeHours: 24,
};
const type = { guestsAllowed: true, memberGuestsAllowed: true, advanceBookingDays: 10, minParticipants: 2, maxParticipants: 4 };

test('effective advance days ladder: override > type > general', () => {
    assert.equal(rules.effectiveAdvanceDays({ setting, type, overrideDays: 14 }), 14);
    assert.equal(rules.effectiveAdvanceDays({ setting, type, overrideDays: null }), 10);
    assert.equal(rules.effectiveAdvanceDays({ setting, type: { advanceBookingDays: null }, overrideDays: null }), 7);
    assert.equal(rules.effectiveAdvanceDays({ setting: { ...setting, allowMembershipTypeOverride: false }, type, overrideDays: 14 }), 10);
});

test('booking window opens tomorrow without same-day booking and one day further after the early-opening hour', () => {
    const w = rules.bookingWindow({ now: { date: '2026-10-25', time: '21:00' }, effectiveDays: 7, hours: 2, allowSameDay: false });
    assert.deepEqual(w, { dateFrom: '2026-10-26', dateTo: '2026-11-01' });
    const late = rules.bookingWindow({ now: { date: '2026-10-25', time: '22:30' }, effectiveDays: 7, hours: 2, allowSameDay: true });
    assert.deepEqual(late, { dateFrom: '2026-10-25', dateTo: '2026-11-02' });
    assert.equal(rules.windowVerdict(w, '2026-10-28'), null);
    assert.match(rules.windowVerdict(w, '2026-11-05'), /outside the booking window/);
    assert.match(rules.windowVerdict(w, '2026-10-25'), /Same-day booking is off/);
});

test('slot set in force: exact day type beats all, latest effective date wins, future sets ignored', () => {
    const sets = [
        { id: 'a', dayScope: 'all', effectiveDate: '2026-01-01', isActive: true },
        { id: 'w', dayScope: 'weekend', effectiveDate: '2026-06-01', isActive: true },
        { id: 'w2', dayScope: 'weekend', effectiveDate: '2027-01-01', isActive: true },
        { id: 'off', dayScope: 'weekday', effectiveDate: '2026-01-01', isActive: false },
    ];
    assert.equal(rules.pickSlotSet(sets, 'weekend', '2026-10-25').id, 'w');
    assert.equal(rules.pickSlotSet(sets, 'weekday', '2026-10-26').id, 'a');
    assert.equal(rules.pickSlotSet([], 'weekday', '2026-10-26'), null);
});

test('closure blocks: whole day and overlapping windows block, touching windows do not', () => {
    assert.equal(rules.isBlocked([{ start: null, end: null }], 480, 540), true);
    assert.equal(rules.isBlocked([{ start: 500, end: 600 }], 480, 540), true);
    assert.equal(rules.isBlocked([{ start: 540, end: 600 }], 480, 540), false);
    assert.equal(rules.isBlocked([], 480, 540), false);
});

test('consecutive rule: adjacent on one facility, capped', () => {
    assert.equal(rules.checkRun([3, 4, 5], 3), null);
    assert.match(rules.checkRun([3, 5], 0), /consecutive/);
    assert.match(rules.checkRun([3, 4, 5, 6], 3), /At most 3/);
    assert.match(rules.checkRun([], 3), /at least one/);
});

test('participant count between min and max', () => {
    assert.match(rules.checkParticipantCount(1, type), /At least 2/);
    assert.match(rules.checkParticipantCount(5, type), /At most 4/);
    assert.equal(rules.checkParticipantCount(3, type), null);
    assert.equal(rules.checkParticipantCount(9, { minParticipants: 0, maxParticipants: null }), null);
});

test('daily limit names the person and the day type', () => {
    assert.equal(rules.checkDailyLimit({ held: 1, adding: 1, limit: 2, name: 'Ahmad', dayType: 'weekday' }), null);
    assert.match(rules.checkDailyLimit({ held: 1, adding: 2, limit: 2, name: 'Ahmad', dayType: 'weekend' }), /Ahmad would hold 3 slots.*weekend limit is 2/);
    assert.equal(rules.checkDailyLimit({ held: 9, adding: 9, limit: 0, name: 'x', dayType: 'weekday' }), null);
});

test('guest rule ladder: exception beats policy, specific weekday beats day type, type tightens general', () => {
    const base = { setting, type, facilityTypeId: 'BADM', date: '2026-10-25', startTime: '09:00' }; // a Sunday
    // No exception: weekend general says no visitors, member-guests ok.
    assert.deepEqual(rules.resolveGuestRule({ ...base, rules: [], dayType: 'weekend' }), { allowGuest: false, allowMemberGuest: true, source: 'policy' });
    // Weekday general allows, the type forbids visitor guests -> tightened.
    assert.equal(rules.resolveGuestRule({ ...base, rules: [], dayType: 'weekday', type: { ...type, guestsAllowed: false } }).allowGuest, false);
    // A Sunday exception on the type allows visitors despite the weekend flag.
    const sunday = { facilityTypeId: 'BADM', dayScope: 'sunday', startTime: null, endTime: null, allowGuest: true, allowMemberGuest: false };
    const weekend = { facilityTypeId: null, dayScope: 'weekend', startTime: null, endTime: null, allowGuest: false, allowMemberGuest: false };
    assert.deepEqual(rules.resolveGuestRule({ ...base, rules: [weekend, sunday], dayType: 'weekend' }), { allowGuest: true, allowMemberGuest: false, source: 'exception' });
    // A time-windowed row applies only inside its window.
    const evening = { facilityTypeId: null, dayScope: 'all', startTime: '18:00', endTime: '22:00', allowGuest: false, allowMemberGuest: false };
    assert.equal(rules.resolveGuestRule({ ...base, rules: [evening], dayType: 'weekday' }).allowGuest, true);
    assert.equal(rules.resolveGuestRule({ ...base, rules: [evening], dayType: 'weekday', startTime: '19:00' }).allowGuest, false);
    // Another type's exception never applies here.
    assert.equal(rules.resolveGuestRule({ ...base, rules: [{ ...sunday, facilityTypeId: 'GYM' }], dayType: 'weekend' }).source, 'policy');
    // Control off = everything allowed.
    assert.equal(rules.resolveGuestRule({ ...base, setting: { ...setting, guestControlEnabled: false }, rules: [weekend], dayType: 'weekend' }).source, 'off');
});

test('session of a slot start and the late-cancel verdict', () => {
    const sessions = [{ id: 'am', startTime: '07:00:00', endTime: '12:00:00' }, { id: 'pm', startTime: '12:00:00', endTime: '18:00:00' }];
    assert.equal(rules.sessionOf(sessions, '11:59:00').id, 'am');
    assert.equal(rules.sessionOf(sessions, '12:00:00').id, 'pm');
    assert.equal(rules.sessionOf(sessions, '20:00:00'), null);
    const now = { date: '2026-10-25', time: '10:00' };
    assert.equal(rules.cancelVerdict({ setting, now, bookingDate: '2026-10-26', startTime: '09:00:00' }).late, true);
    assert.equal(rules.cancelVerdict({ setting, now, bookingDate: '2026-10-26', startTime: '11:00:00' }).late, false);
    assert.equal(rules.cancelVerdict({ setting: { ...setting, noShowControlEnabled: false }, now, bookingDate: '2026-10-25', startTime: '11:00:00' }).late, false);
    assert.equal(rules.isPast(now, '2026-10-25', '10:00:00'), true);
    assert.equal(rules.isPast(now, '2026-10-25', '10:30:00'), false);
    assert.equal(rules.weekdayKeyOf('2026-10-25'), 'sunday');
});
