// Utility Items - the PURE rules (slice 6a, structures approved 2026-11-11):
// no DB, unit-tested. How an item behaves at the station, the normalisation
// of its two behaviour switches, and the unit codes "Generate units" proposes.

const UNIT_CODE_RE = /^[A-Z0-9_-]{1,20}$/;
const PREFIX_RE = /^[A-Z0-9_-]{0,12}$/;
const MAX_GENERATE = 500;

// 'units' (numbered, issued and returned one by one), 'quantity' (counted,
// issued and counted back) or 'use' (recorded and closed at once).
function behaviourOf(item) {
    if (item && item.trackUnits === true) return 'units';
    return item && item.returnRequired === false ? 'use' : 'quantity';
}

const BEHAVIOUR_LABELS = { units: 'Numbered units', quantity: 'By quantity', use: 'Use only' };

// The stored switches for an intended pair: numbered units are always
// returned and carry no stock count; a use-only item is never due back.
function normalizeBehaviour({ trackUnits, returnRequired, stockQuantity = null, dueDays = 0 }) {
    const units = trackUnits === true;
    const back = units ? true : returnRequired !== false;
    return {
        trackUnits: units,
        returnRequired: back,
        stockQuantity: units || !back ? null : stockQuantity,
        dueDays: back ? Number(dueDays) || 0 : 0,
    };
}

// The codes "Generate units" would add: prefix + the number padded to `pad`
// digits (default: the width of `to`), flagged when the code already exists.
// Returns { error } or { codes: [{ code, exists }], fresh }.
function generateUnitCodes({ prefix = '', from, to, pad = null, existing = [] }) {
    const p = String(prefix || '').trim().toUpperCase();
    if (!PREFIX_RE.test(p)) return { error: 'Prefix: up to 12 characters, letters, digits, underscores and hyphens only.' };
    const a = Number(from);
    const b = Number(to);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < a || b > 99999) return { error: 'Numbers: whole numbers from 0 to 99999, the last not below the first.' };
    if (b - a + 1 > MAX_GENERATE) return { error: `Generate at most ${MAX_GENERATE} units at a time.` };
    const width = pad === null || pad === undefined || pad === '' ? String(b).length : Number(pad);
    if (!Number.isInteger(width) || width < 1 || width > 6) return { error: 'Digits must be a whole number between 1 and 6.' };
    const taken = new Set((existing || []).map((c) => String(c).toUpperCase()));
    const codes = [];
    for (let n = a; n <= b; n += 1) {
        const code = `${p}${String(n).padStart(width, '0')}`;
        if (!UNIT_CODE_RE.test(code)) return { error: `'${code}' is longer than 20 characters - shorten the prefix.` };
        codes.push({ code, exists: taken.has(code) });
    }
    return { codes, fresh: codes.filter((c) => !c.exists).length };
}

module.exports = { UNIT_CODE_RE, MAX_GENERATE, BEHAVIOUR_LABELS, behaviourOf, normalizeBehaviour, generateUnitCodes };
