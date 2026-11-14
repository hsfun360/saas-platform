// Player Type catalog (spec 2.3.1; user decisions 2026-10-15; six classes
// 2026-11-13) - the seam the booking, front-desk, group and transaction-type
// code reads instead of the old fixed vocabulary. `catalog()` seeds the
// system rows on first use per company so an existing club keeps working
// unchanged; the pure helpers (baseOf, pickable, the class tests) are
// unit-tested.

const GolfPlayerType = require('./playerType.model');
const {
    SYSTEM_PLAYER_TYPES, BASE_IDENTITY_KEYS, VISIT_ONLY_BASES, HOSTED_GUEST_BASES, MEMBER_GUEST_CODE,
} = require('./playerType.constants');

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

// Types a clerk or member may pick on a line, by CHANNEL (2026-11-13):
//   booking - the booking screen and change booking: active, not a visit-only
//             class, not the derived system member-guest row, and NOT a
//             visitor (visitors have no advance booking - desk only);
//   desk    - the front-desk walk-in: the same plus the visitor types;
//   group   - a group / tournament roster: everything but the visit-only
//             classes (the organiser prices the roster as they see fit).
function isPickable(t, channel = 'booking') {
    if (t.isActive === false) return false;
    if (VISIT_ONLY_BASES.includes(t.baseIdentity)) return false;
    if (channel === 'group') return true;
    if (t.isSystem === true && t.baseIdentity === 'member-guest') return false;
    if (channel === 'booking' && t.baseIdentity === 'visitor') return false;
    return true;
}

function pickable(types, channel = 'booking') {
    return types.filter((t) => isPickable(t, channel));
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

// ---- class tests used by the rule engine ------------------------------------

// Any class that is not a member of this club playing on their own right.
function isGuestLike(types, code) {
    const base = baseOf(types, code);
    return base !== null && base !== 'member';
}
// A line that draws on a HOST member: guest control's allow-guests flag, the
// host's per-booking quota and the monthly guest allowance.
function isHostedGuest(types, code) {
    return HOSTED_GUEST_BASES.includes(baseOf(types, code));
}
function isVisitorBase(types, code) {
    return baseOf(types, code) === 'visitor';
}
// A member of an affiliated or reciprocal club (a confirmed visit's golfer).
function isClubVisitor(types, code) {
    return VISIT_ONLY_BASES.includes(baseOf(types, code));
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
    return base === 'guest' || base === 'visitor' || VISIT_ONLY_BASES.includes(base);
}
// The codes of every type on one base (e.g. the rounds a golfer played as a
// member-guest, which never count toward their own round quota).
function codesOfBase(types, base) {
    return types.filter((t) => t.baseIdentity === base).map((t) => t.code);
}

module.exports = {
    dto, ensureSystemTypes, catalog, findType, baseOf, isPickable, pickable, asVocabulary, labelsOf, labelOf,
    isGuestLike, isHostedGuest, isVisitorBase, isClubVisitor, isMemberBase, hasMemberStanding, needsGuestName, codesOfBase,
    MEMBER_GUEST_CODE,
};
