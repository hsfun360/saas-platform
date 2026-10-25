// Slot generation for a Facility Type slot set - PURE (no DB), so the
// preview endpoint and the saved rows come from one function and the rule is
// unit-tested. Slots run from firstSlotTime in steps of slotMinutes while the
// start is <= lastSlotTime; a slot's end is start + slotMinutes and must not
// pass midnight. Slots starting at or after frontDeskFrom default to
// front-desk-only.

const { LIMITS } = require('./facility.constants');
const { toMinutes, fromMinutes } = require('./facilityShared');

// header: { firstSlotTime, lastSlotTime, slotMinutes, frontDeskFrom? } with
// 'HH:MM[:SS]' times. Returns { error } or { slots: [...] }.
function generateSlots(header) {
    const first = toMinutes(header.firstSlotTime);
    const last = toMinutes(header.lastSlotTime);
    const minutes = Number(header.slotMinutes);
    const deskFrom = header.frontDeskFrom ? toMinutes(header.frontDeskFrom) : null;

    if (!Number.isInteger(minutes) || minutes < LIMITS.slotMinutesMin || minutes > LIMITS.slotMinutesMax) {
        return { error: `Slot length must be a whole number of minutes between ${LIMITS.slotMinutesMin} and ${LIMITS.slotMinutesMax}.` };
    }
    if (first > last) return { error: 'The last slot must not start before the first slot.' };
    if (last + minutes > 24 * 60) return { error: 'The last slot must end by midnight.' };

    const slots = [];
    for (let start = first, n = 1; start <= last; start += minutes, n += 1) {
        if (n > LIMITS.maxSlotsPerSet) {
            return { error: `A slot set cannot have more than ${LIMITS.maxSlotsPerSet} slots - lengthen the slots or shorten the day.` };
        }
        slots.push({
            slotNumber: n,
            startTime: fromMinutes(start),
            endTime: fromMinutes(start + minutes),
            isFrontDesk: deskFrom !== null && start >= deskFrom,
            isActive: true,
        });
    }
    return { slots };
}

module.exports = { generateSlots };
