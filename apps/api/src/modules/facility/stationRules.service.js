// The PURE rules of the Control Station (approved 2026-10-26, the eight
// station rules of the spec). No database access: the station service loads
// the facts (the club clock, the type, the day's registrations and issues)
// and asks here, so each verdict is unit-tested on its own.

const { toMinutes } = require('./facilityShared');
const { minutesUntil } = require('./bookingRules.service');

// ---- rule 1: the check-in window of a booked slot -------------------------

// 'early' before (start - openMinutes), 'open' from then until the slot's
// end, 'closed' after the end. `now` = the club clock { date, time }.
function checkInState(now, { bookingDate, startTime, endTime }, openMinutes) {
    const toStart = minutesUntil(now, bookingDate, startTime);
    const toEnd = minutesUntil(now, bookingDate, endTime);
    if (toStart > Number(openMinutes || 0)) return 'early';
    if (toEnd <= 0) return 'closed';
    return 'open';
}

// ---- rule 2: opening hours and the live capacity --------------------------

// The type's opening window for a day type in minutes, or null = no
// restriction (both ends NULL).
function openingHours(type, dayType) {
    const open = dayType === 'weekend' ? type.openTimeWeekend : type.openTimeWeekday;
    const close = dayType === 'weekend' ? type.closeTimeWeekend : type.closeTimeWeekday;
    if (!open && !close) return null;
    return { open: open ? toMinutes(open) : 0, close: close ? toMinutes(close) : 24 * 60 };
}

// Is the club clock inside the opening window (null = always)?
function isOpenAt(hours, time) {
    if (!hours) return true;
    const m = toMinutes(time);
    return m >= hours.open && m < hours.close;
}

// Persons inside: every registration still 'in' counts itself plus its guests.
function liveCount(registrations) {
    return (registrations || []).filter((r) => r.status === 'in').reduce((s, r) => s + 1 + Number(r.guestCount || 0), 0);
}

// Refuse when the arriving party would push the count past the capacity
// (null = unlimited). Returns an error message or null.
function capacityVerdict({ count, arriving, capacity, label }) {
    if (capacity === null || capacity === undefined) return null;
    const cap = Number(capacity);
    if (count + arriving > cap) return `${label} is at capacity - ${count} of ${cap} inside, ${arriving} arriving.`;
    return null;
}

// ---- rule 5: issue limits ------------------------------------------------------

// Units or pieces a patron holds across the type's live issues.
function heldByPatron(issues, patronId) {
    return (issues || []).filter((i) => i.status === 'issued' && i.patronId === patronId).reduce((s, i) => s + Number(i.quantity || 1), 0);
}

// Refuse past the limit per person (0 = no limit). `usedToday` (the code of
// a use-only item) words the refusal as uses of the day: nothing is held.
function issueLimitVerdict({ held, taking, limit, name, unitWord, usedToday = null }) {
    if (!limit || limit <= 0) return null;
    if (held + taking <= limit) return null;
    if (usedToday) {
        return held
            ? `${name} has already used ${usedToday} ${held} time${held === 1 ? '' : 's'} today - the limit is ${limit} a day.`
            : `${taking} ${usedToday} uses are over the limit of ${limit} a day.`;
    }
    return `${name} would hold ${held + taking} ${unitWord} - the limit is ${limit}${held ? ` (already holding ${held})` : ''}.`;
}

// Due back: `issueDueDays` after the issue date at the type's close time for
// that day type (or end of day), as a club-local 'YYYY-MM-DDTHH:MM' string
// the caller converts with the club's timezone.
function dueBackLocal({ issueDate, dueDays, hours }) {
    const d = new Date(`${issueDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + Number(dueDays || 0));
    const date = d.toISOString().slice(0, 10);
    const closeMin = hours && hours.close < 24 * 60 ? hours.close : 23 * 60 + 59;
    const hh = String(Math.floor(closeMin / 60)).padStart(2, '0');
    const mm = String(closeMin % 60).padStart(2, '0');
    return `${date}T${hh}:${mm}`;
}

// ---- rule 6: the return ---------------------------------------------------------

// What a return does to the record and its unit. `returnedQuantity` applies
// to consumables (short = the difference is lost).
function returnOutcome({ condition, quantity, returnedQuantity, trackUnits }) {
    if (!['good', 'damaged', 'lost'].includes(condition)) return { error: 'Pick the return condition: good, damaged or lost.' };
    if (trackUnits) {
        return {
            status: condition === 'lost' ? 'lost' : 'returned',
            unitStatus: condition === 'good' ? 'available' : 'out-of-service',
            lostQuantity: condition === 'lost' ? quantity : 0,
            returnedQuantity: condition === 'lost' ? 0 : quantity,
        };
    }
    const back = returnedQuantity === undefined || returnedQuantity === null ? (condition === 'lost' ? 0 : quantity) : Number(returnedQuantity);
    if (!Number.isInteger(back) || back < 0 || back > quantity) return { error: `Returned pieces must be between 0 and ${quantity}.` };
    const lost = quantity - back;
    return { status: lost > 0 && back === 0 ? 'lost' : 'returned', unitStatus: null, lostQuantity: lost, returnedQuantity: back };
}

// ---- slice 6b: scan and serve ---------------------------------------------------

// Minutes after an issue during which the desk may undo a wrong tap.
const UNDO_MINUTES = 5;

// What the desk scanned or keyed: a guest pass (the pass link, or the bare
// 64-character token a handheld scanner types) or, anything else, a member
// number. Empty = nothing to read.
function scanKind(code) {
    const raw = String(code || '').trim();
    if (!raw) return null;
    if (/[a-f0-9]{64}/i.test(raw) || /guest-pass\//i.test(raw)) return 'pass';
    return 'member';
}

// May this pass be served today? Null = yes, else the refusal in words.
function passVerdict(pass) {
    if (!pass) return 'No guest pass of this club matches that code.';
    if (pass.passState === 'cancelled') return `Pass ${pass.registrationNo} is cancelled.`;
    if (pass.passState === 'upcoming') return `This pass is for ${pass.visitDateText} - it is not valid today.`;
    if (pass.passState === 'expired') return `This pass was for ${pass.visitDateText} and has expired.`;
    return null;
}

// May the person in the panel take this utility item now? Returns
// { allowed, reason }: the reason is the line the tile shows in place of its
// button. `held` = pieces or units the person holds (a use-only item: uses
// today); `fee` = { code, unitAmount } or null (free); `priceRequired` =
// the fee item refuses without a price (no manual price allowed).
function serveTileVerdict({ behaviour, isGuest, guestsAllowed, requiresEntry, inside, held, limit, freeUnits, fee, priceRequired = true }) {
    if (isGuest && guestsAllowed === false) return { allowed: false, reason: 'Members only.' };
    if (requiresEntry && !inside) return { allowed: false, reason: 'Only for a person inside a facility today.' };
    const cap = Number(limit || 0);
    if (cap > 0 && Number(held || 0) >= cap) {
        return { allowed: false, reason: behaviour === 'use' ? `Limit reached - used ${held} of ${cap} today.` : `Limit reached - holding ${held} of ${cap}.` };
    }
    if (behaviour === 'units' && !Number(freeUnits || 0)) return { allowed: false, reason: 'No unit free.' };
    if (fee && (fee.unitAmount === null || fee.unitAmount === undefined) && priceRequired) return { allowed: false, reason: `${fee.code} has no price today.` };
    return { allowed: true, reason: null };
}

// May the desk undo this issue? Only a live issue (or a recorded use) inside
// the undo window, and only while its bill is not settled. Null = yes.
function undoVerdict({ status, issuedAt, now = new Date(), billStatus = null, minutes = UNDO_MINUTES }) {
    if (status !== 'issued' && status !== 'used') return `Already ${status} - nothing to undo.`;
    const age = (new Date(now).getTime() - new Date(issuedAt).getTime()) / 60000;
    if (age > minutes) return `Undo is for the first ${minutes} minutes - return it the normal way.`;
    if (billStatus === 'settled') return 'Its bill is already settled - return it the normal way.';
    return null;
}

module.exports = {
    checkInState, openingHours, isOpenAt, liveCount, capacityVerdict,
    heldByPatron, issueLimitVerdict, dueBackLocal, returnOutcome,
    UNDO_MINUTES, scanKind, passVerdict, serveTileVerdict, undoVerdict,
};
