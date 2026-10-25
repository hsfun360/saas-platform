const test = require('node:test');
const assert = require('node:assert/strict');
const { generateSlots } = require('./slotSet.service');

test('generates hourly slots from first to last start inclusive', () => {
    const { slots, error } = generateSlots({ firstSlotTime: '08:00', lastSlotTime: '21:00', slotMinutes: 60 });
    assert.equal(error, undefined);
    assert.equal(slots.length, 14);
    assert.deepEqual(slots[0], { slotNumber: 1, startTime: '08:00:00', endTime: '09:00:00', isFrontDesk: false, isActive: true });
    assert.equal(slots[13].startTime, '21:00:00');
    assert.equal(slots[13].endTime, '22:00:00');
});

test('front-desk flag starts at frontDeskFrom', () => {
    const { slots } = generateSlots({ firstSlotTime: '08:00', lastSlotTime: '10:00', slotMinutes: 60, frontDeskFrom: '09:00:00' });
    assert.deepEqual(slots.map((s) => s.isFrontDesk), [false, true, true]);
});

test('refuses a last slot that would end past midnight', () => {
    const { error } = generateSlots({ firstSlotTime: '20:00', lastSlotTime: '23:30', slotMinutes: 60 });
    assert.match(error, /midnight/);
});

test('refuses a last start before the first start and bad slot lengths', () => {
    assert.match(generateSlots({ firstSlotTime: '10:00', lastSlotTime: '09:00', slotMinutes: 60 }).error, /last slot/);
    assert.match(generateSlots({ firstSlotTime: '08:00', lastSlotTime: '09:00', slotMinutes: 10 }).error, /between 15 and 240/);
    assert.match(generateSlots({ firstSlotTime: '08:00', lastSlotTime: '09:00', slotMinutes: '45.5' }).error, /between 15 and 240/);
});

test('caps the slot count', () => {
    const { error } = generateSlots({ firstSlotTime: '00:00', lastSlotTime: '23:45', slotMinutes: 15 });
    assert.equal(error, undefined, '96 quarter-hour slots fit');
    const bad = generateSlots({ firstSlotTime: '00:00', lastSlotTime: '23:45', slotMinutes: 15 });
    assert.equal(bad.slots.length, 96);
});
