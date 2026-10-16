// Player Type catalog (spec 2.3.1; user decisions 2026-10-15) - the seam the
// booking, front-desk, group and transaction-type code reads instead of the
// old fixed vocabulary. `catalog()` seeds the three system rows on first use
// per company so an existing club keeps working unchanged; the pure helpers
// (baseOf, isPickable, labelsOf) are unit-tested.

const GolfPlayerType = require('./playerType.model');
const { SYSTEM_PLAYER_TYPES, BASE_IDENTITY_KEYS } = require('./playerType.constants');

function dto(t) {
    return {
        id: t.id,
        code: t.code,
        description: t.description,
        baseIdentity: t.baseIdentity,
        requiresApproval: t.requiresApproval === true,
        isSystem: t.isSystem === true,
        isActive: t.isActive !== false,
        sortOrder: t.sortOrder,
    };
}

// Seed the system rows a company is missing (idempotent; safe under a race
// thanks to the unique index - a duplicate insert is simply ignored).
async function ensureSystemTypes(companyId, { transaction } = {}) {
    const existing = await GolfPlayerType.findAll({ where: { companyId, isSystem: true }, attributes: ['code'], transaction });
    const have = new Set(existing.map((r) => r.code));
    for (const s of SYSTEM_PLAYER_TYPES) {
        if (have.has(s.code)) continue;
        try {
            await GolfPlayerType.create({ companyId, ...s, requiresApproval: false, isSystem: true, isActive: true }, { transaction });
        } catch (err) {
            if (!err || err.name !== 'SequelizeUniqueConstraintError') throw err;
        }
    }
}

// Every type of the company (active and inactive), system rows first then
// by sortOrder + code. Plain DTOs.
async function catalog(companyId, { transaction, activeOnly = false } = {}) {
    await ensureSystemTypes(companyId, { transaction });
    const where = { companyId };
    if (activeOnly) where.isActive = true;
    const rows = await GolfPlayerType.findAll({ where, order: [['isSystem', 'DESC'], ['sortOrder', 'ASC'], ['code', 'ASC']], transaction });
    return rows.map(dto);
}

// ---- pure helpers over a catalog array ------------------------------------

function findType(types, code) {
    return types.find((t) => t.code === code) || null;
}

// The engine class of a code: a known type's base, else the code itself when
// it IS a base key (legacy lines before the master), else null.
function baseOf(types, code) {
    const t = findType(types, code);
    if (t) return t.baseIdentity;
    return BASE_IDENTITY_KEYS.includes(code) ? code : null;
}

// Types a clerk or member may pick on a booking line or a walk-in: active
// and not affiliate-base (affiliates enter only through a confirmed visit).
function isPickable(t) {
    return t.isActive !== false && t.baseIdentity !== 'affiliate';
}

function pickable(types) {
    return types.filter(isPickable);
}

// Vocabulary shape ({ key, label }) for the /meta endpoints and the pickers.
function asVocabulary(types) {
    return types.map((t) => ({ key: t.code, label: t.description, baseIdentity: t.baseIdentity, requiresApproval: t.requiresApproval }));
}

function labelsOf(types) {
    return new Map(types.map((t) => [t.code, t.description]));
}

function labelOf(types, code) {
    const t = findType(types, code);
    return t ? t.description : code;
}

// Base-class tests used by the rule engine.
function isGuestLike(types, code) {
    const base = baseOf(types, code);
    return base === 'guest' || base === 'member-guest' || base === 'affiliate';
}
function isMemberBase(types, code) {
    return baseOf(types, code) === 'member';
}
function hasMemberStanding(types, code) {
    const base = baseOf(types, code);
    return base === 'member' || base === 'member-guest';
}
function needsGuestName(types, code) {
    const base = baseOf(types, code);
    return base === 'guest' || base === 'affiliate';
}

module.exports = {
    dto, ensureSystemTypes, catalog, findType, baseOf, isPickable, pickable, asVocabulary, labelsOf, labelOf,
    isGuestLike, isMemberBase, hasMemberStanding, needsGuestName,
};
