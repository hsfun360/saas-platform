// Helpers shared by the facility controllers: the active company, the time /
// date / integer parsers (same conventions as golf) and the ownership stamps.

const { getUserContext, getCallerPlacement } = require('../../platform/serviceContext');

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

// The three RBAC ownership stamps for a create (update paths set updatedBy).
async function stampsFor(req) {
    const placement = await getCallerPlacement(req);
    const callerId = getUserContext(req).userId;
    return { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
}

// 'HH:MM' (or 'HH:MM:SS') time of day; normalized to 'HH:MM:00' for storage.
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
function normalizeTime(v) {
    if (v === undefined || v === null || v === '') return { ok: true, value: null };
    const s = String(v).trim();
    if (!TIME_RE.test(s)) return { ok: false, value: null };
    return { ok: true, value: `${s.slice(0, 5)}:00` };
}

// Postgres TIME comes back as 'HH:MM:SS'; the screens work in 'HH:MM'.
function timeDto(v) {
    return v ? String(v).slice(0, 5) : null;
}

// 'YYYY-MM-DD'.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Optional integer: absent / blank -> null; otherwise an integer in [min, max].
function parseOptionalInt(v, min, max) {
    if (v === undefined || v === null || v === '') return { ok: true, value: null };
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) return { ok: false, value: null };
    return { ok: true, value: n };
}

// Required integer in [min, max].
function parseRequiredInt(v, min, max) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) return { ok: false, value: null };
    return { ok: true, value: n };
}

// Inclusive day count of a 'YYYY-MM-DD' range.
function rangeDays(dateFrom, dateTo) {
    const from = new Date(`${dateFrom}T00:00:00Z`).getTime();
    const to = new Date(`${dateTo}T00:00:00Z`).getTime();
    return Math.round((to - from) / 86400000) + 1;
}

// Minutes since midnight of an 'HH:MM[:SS]' string, and back.
function toMinutes(t) {
    const [h, m] = String(t).split(':').map(Number);
    return h * 60 + m;
}
function fromMinutes(total) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

module.exports = {
    companyIdOf,
    stampsFor,
    TIME_RE,
    normalizeTime,
    timeDto,
    DATE_RE,
    parseOptionalInt,
    parseRequiredInt,
    rangeDays,
    toMinutes,
    fromMinutes,
};
