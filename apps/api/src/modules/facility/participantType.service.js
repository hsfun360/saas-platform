// Participant Type catalog (structure approved 2026-10-25; golf's
// playerType.service) - the seam the booking, billing and rate-card code
// reads instead of a fixed vocabulary. `catalog()` seeds the three system
// rows on first use per company; the pure helpers are unit-tested.

const ParticipantType = require('./participantType.model');
const { SYSTEM_PARTICIPANT_TYPES, BASE_IDENTITY_KEYS } = require('./facility.constants');

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

// Seed the system rows a company is missing (idempotent; a duplicate insert
// under a race is ignored thanks to the unique index).
async function ensureSystemTypes(companyId, { transaction } = {}) {
    const existing = await ParticipantType.findAll({ where: { companyId, isSystem: true }, attributes: ['code'], transaction });
    const have = new Set(existing.map((r) => r.code));
    for (const s of SYSTEM_PARTICIPANT_TYPES) {
        if (have.has(s.code)) continue;
        try {
            await ParticipantType.create({ companyId, ...s, requiresApproval: false, isSystem: true, isActive: true }, { transaction });
        } catch (err) {
            if (!err || err.name !== 'SequelizeUniqueConstraintError') throw err;
        }
    }
}

// Every type of the company, system rows first then by sortOrder + code.
async function catalog(companyId, { transaction, activeOnly = false } = {}) {
    await ensureSystemTypes(companyId, { transaction });
    const where = { companyId };
    if (activeOnly) where.isActive = true;
    const rows = await ParticipantType.findAll({ where, order: [['isSystem', 'DESC'], ['sortOrder', 'ASC'], ['code', 'ASC']], transaction });
    return rows.map(dto);
}

// ---- pure helpers over a catalog array ----

function findType(types, code) {
    return types.find((t) => t.code === code) || null;
}

// The engine class of a code: a known type's base, else the code itself when
// it IS a base key, else null.
function baseOf(types, code) {
    const t = findType(types, code);
    if (t) return t.baseIdentity;
    return BASE_IDENTITY_KEYS.includes(code) ? code : null;
}

// Vocabulary shape ({ key, label }) for the /meta endpoints and the pickers.
function asVocabulary(types) {
    return types.map((t) => ({ key: t.code, label: t.description, baseIdentity: t.baseIdentity, requiresApproval: t.requiresApproval }));
}

function labelOf(types, code) {
    const t = findType(types, code);
    return t ? t.description : code;
}

function isGuestLike(types, code) {
    const base = baseOf(types, code);
    return base === 'guest' || base === 'member-guest';
}
function isVisitorGuest(types, code) {
    return baseOf(types, code) === 'guest';
}
function hasMemberStanding(types, code) {
    const base = baseOf(types, code);
    return base === 'member' || base === 'member-guest';
}

module.exports = { dto, ensureSystemTypes, catalog, findType, baseOf, asVocabulary, labelOf, isGuestLike, isVisitorGuest, hasMemberStanding };
