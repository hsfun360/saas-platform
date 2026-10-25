// Rate-card resolution and cell validation for facility transaction types
// (structure approved 2026-10-25) - PURE, so the billing engine (slice 2c)
// and the rate editor share one rule and it is unit-tested here.
//
// A matrix card (facility-fee / guest-fee) prices through CELLS keyed
// (participantType, dayScope, sessionId NULL = any). Resolution for a slot:
// among the cells of the participant type whose day scope and session
// match, the most specific wins - an exact session outranks "any session",
// an exact day scope outranks 'all'. No cell = no price (null), never a
// silent zero.

const { DAY_SCOPE_KEYS, LIMITS } = require('./facility.constants');

// The card in force on `date`: active, effective on or before the date,
// latest effective date first. `cards`: [{ effectiveDate, isActive, ... }].
function pickCard(cards, date) {
    const d = String(date);
    const live = (cards || []).filter((c) => c.isActive !== false && String(c.effectiveDate) <= d);
    live.sort((a, b) => (String(a.effectiveDate) < String(b.effectiveDate) ? 1 : -1));
    return live[0] || null;
}

// cells: [{ participantType, dayScope, sessionId, amount }]; slot facts:
// { participantType, dayType: 'weekday'|'weekend', sessionId|null }.
function resolveCell(cells, { participantType, dayType, sessionId = null }) {
    let best = null;
    let bestRank = -1;
    for (const c of cells || []) {
        if (c.participantType !== participantType) continue;
        if (c.dayScope !== 'all' && c.dayScope !== dayType) continue;
        if (c.sessionId !== null && c.sessionId !== undefined && c.sessionId !== sessionId) continue;
        const rank = (c.sessionId ? 2 : 0) + (c.dayScope !== 'all' ? 1 : 0);
        if (rank > bestRank) {
            best = c;
            bestRank = rank;
        }
    }
    return best;
}

// Parse one money amount: number or numeric string, >= 0, 2dp; undefined when invalid.
function parseAmount(v) {
    const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.round(n * 100) / 100;
}

// Validate + normalise the cell rows of a matrix card. Returns { cells } or
// { error }. knownParticipantCodes / knownSessionIds are Sets.
function normalizeCells(raw, { knownParticipantCodes, knownSessionIds }) {
    const rows = Array.isArray(raw) ? raw : [];
    if (!rows.length) return { error: 'A price card needs at least one cell.' };
    if (rows.length > LIMITS.maxRateCells) return { error: `A price card cannot have more than ${LIMITS.maxRateCells} cells.` };
    const cells = [];
    const seen = new Set();
    for (const r of rows) {
        if (!r || typeof r !== 'object') return { error: 'Invalid price cell.' };
        const participantType = String(r.participantType || '').trim();
        if (!knownParticipantCodes.has(participantType)) return { error: `Price cell names an unknown participant type '${participantType}'.` };
        const dayScope = String(r.dayScope || 'all');
        if (!DAY_SCOPE_KEYS.includes(dayScope)) return { error: 'Price cell day scope must be All days, Weekdays or Weekends.' };
        const sessionId = r.sessionId ? String(r.sessionId) : null;
        if (sessionId && !knownSessionIds.has(sessionId)) return { error: 'Price cell names a session that is not on the Facility Specification.' };
        const amount = parseAmount(r.amount);
        if (amount === undefined) return { error: `Price for ${participantType} (${dayScope}${sessionId ? ', session' : ''}) must be 0.00 or more.` };
        const key = `${participantType}|${dayScope}|${sessionId || '*'}`;
        if (seen.has(key)) return { error: `Duplicate price cell for ${participantType} (${dayScope}${sessionId ? ', session' : ''}).` };
        seen.add(key);
        cells.push({ participantType, dayScope, sessionId, amount });
    }
    return { cells };
}

module.exports = { pickCard, resolveCell, parseAmount, normalizeCells };
