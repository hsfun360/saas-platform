// The PURE pricing of a facility bill line (approved 2026-10-25, sub-slice
// 2c): which rate card is in force on the bill date and which CELL of it
// prices the line - participant type x day scope x session, the more
// specific cell winning (rateCard.service.resolveCell). Matrix charge types
// (facility-fee, guest-fee) price by cell; every other charge type takes the
// card's flat amount. A missing price is returned as a named cell so the
// desk's refusal says exactly what to set up (rule 9).

const { MATRIX_CHARGE_TYPE_KEYS } = require('./facility.constants');
const { pickCard, resolveCell } = require('./rateCard.service');

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

function cents(n) {
    return Math.round((Number(n) || 0) * 100);
}

// Describe the cell a matrix line needs, for the refusal message.
function cellLabel({ participantType, dayType, sessionName }) {
    return `${participantType} / ${dayType}${sessionName ? ` / ${sessionName}` : ''}`;
}

// The unit price of `type` from `cards` (each with `cells`) on `date` for the
// line context. Returns { unitAmount } or { missing } (a message).
function unitPriceOf(type, cards, { date, participantType, dayType, sessionId = null, sessionName = null }) {
    const card = pickCard(cards, date);
    if (!card) return { missing: `'${type.transactionType}' has no price card in force on ${date} - set up its pricing first.` };
    if (MATRIX_CHARGE_TYPE_KEYS.includes(type.chargeType)) {
        const cell = resolveCell(card.cells || [], { participantType, dayType, sessionId });
        if (!cell) {
            return { missing: `'${type.transactionType}' has no price for ${cellLabel({ participantType, dayType, sessionName })} on ${date} - add that cell to its price card.` };
        }
        return { unitAmount: round2(cell.amount) };
    }
    if (card.flatAmount === null || card.flatAmount === undefined) {
        return { missing: `'${type.transactionType}' has no amount on its price card in force on ${date}.` };
    }
    return { unitAmount: round2(card.flatAmount) };
}

// Pick the DEFAULT transaction type for a charge type and participant type:
// the Facility Type's explicit pick first, else the active type flagged as
// the default for that participant category - one scoped to this facility
// type beating a general one. `types` = the company's transaction types.
function defaultTypeFor(types, { chargeType, participantType, facilityTypeId, explicitId = null }) {
    if (explicitId) {
        const explicit = types.find((t) => t.id === explicitId && t.isActive !== false);
        if (explicit) return explicit;
    }
    const candidates = types.filter((t) => t.isActive !== false && t.chargeType === chargeType && t.participantType === participantType);
    return candidates.find((t) => t.facilityTypeId === facilityTypeId) || candidates.find((t) => !t.facilityTypeId) || null;
}

// What the booker counts as for the per-slot facility fee: the member
// category for a member booker, the visitor guest category otherwise.
function bookerCategory(bookerPatron) {
    return bookerPatron && bookerPatron.patronType === 'member' ? 'member' : 'guest';
}

module.exports = { round2, cents, cellLabel, unitPriceOf, defaultTypeFor, bookerCategory };
