// The Patron identity (structure approved 2026-10-25; golf's Golfer /
// OtherGolfer pattern): one thin facility row per person who books or takes
// part, created LAZILY at first booking. A member's row points at the
// membership Member id and refreshes its name / number snapshot from the
// standing every time it is touched; a visitor's row points at the
// facility-owned OtherPatron profile, deduped by identity number or mobile.

const { Op } = require('sequelize');
const Patron = require('./patron.model');
const OtherPatron = require('./otherPatron.model');

function dto(p, other = null) {
    return {
        id: p.id,
        patronType: p.patronType,
        sourceId: p.sourceId,
        name: p.name,
        memberNo: p.memberNo || null,
        isActive: p.isActive !== false,
        mobile: other ? other.mobile || null : null,
        email: other ? other.email || null : null,
        identityNo: other ? other.identityNo || null : null,
    };
}

// Find or create the member's Patron from a membership standing
// ({ memberId, memberNo, name }); the snapshot follows the source.
async function ensureMemberPatron(companyId, standing, stamps, { transaction } = {}) {
    const [row, created] = await Patron.findOrCreate({
        where: { companyId, patronType: 'member', sourceId: standing.memberId },
        defaults: { companyId, patronType: 'member', sourceId: standing.memberId, name: standing.name, memberNo: standing.memberNo, isActive: true, ...stamps },
        transaction,
    });
    if (!created && (row.name !== standing.name || row.memberNo !== standing.memberNo)) {
        row.name = standing.name;
        row.memberNo = standing.memberNo;
        row.updatedBy = stamps ? stamps.updatedBy : row.updatedBy;
        await row.save({ transaction });
    }
    return row;
}

// Find or create a VISITOR's Patron. An existing OtherPatron with the same
// identity number (or, failing that, the same mobile) is reused and its
// contact details filled in where blank; otherwise a profile and a Patron
// are created together.
async function ensureOtherPatron(companyId, visitor, stamps, { transaction } = {}) {
    const name = String(visitor.name || '').trim();
    if (!name) return { error: 'Key in the visitor\'s name.' };
    const identityNo = visitor.identityNo ? String(visitor.identityNo).trim() : null;
    const mobile = visitor.mobile ? String(visitor.mobile).trim() : null;
    const email = visitor.email ? String(visitor.email).trim() : null;

    let profile = null;
    if (identityNo) profile = await OtherPatron.findOne({ where: { companyId, identityNo: { [Op.iLike]: identityNo } }, transaction });
    if (!profile && mobile) profile = await OtherPatron.findOne({ where: { companyId, mobile }, transaction });
    if (profile) {
        let dirty = false;
        if (!profile.mobile && mobile) { profile.mobile = mobile; dirty = true; }
        if (!profile.email && email) { profile.email = email; dirty = true; }
        if (!profile.identityNo && identityNo) { profile.identityNo = identityNo; dirty = true; }
        if (dirty) { profile.updatedBy = stamps ? stamps.updatedBy : profile.updatedBy; await profile.save({ transaction }); }
    } else {
        profile = await OtherPatron.create({ companyId, name, identityNo, mobile, email, isActive: true, ...stamps }, { transaction });
    }
    const [row] = await Patron.findOrCreate({
        where: { companyId, patronType: 'other', sourceId: profile.id },
        defaults: { companyId, patronType: 'other', sourceId: profile.id, name: profile.name, memberNo: null, isActive: true, ...stamps },
        transaction,
    });
    return { patron: row, profile };
}

// Desk search by name, member number, identity number or mobile.
async function search(companyId, q, { limit = 20 } = {}) {
    const term = String(q || '').trim();
    if (!term) return [];
    const like = `%${term}%`;
    const profiles = await OtherPatron.findAll({
        where: { companyId, [Op.or]: [{ name: { [Op.iLike]: like } }, { identityNo: { [Op.iLike]: like } }, { mobile: { [Op.iLike]: like } }] },
        attributes: ['id', 'name', 'identityNo', 'mobile', 'email'],
        limit,
    });
    const profileIds = profiles.map((p) => p.id);
    const rows = await Patron.findAll({
        where: {
            companyId,
            isActive: true,
            [Op.or]: [
                { name: { [Op.iLike]: like } },
                { memberNo: { [Op.iLike]: like } },
                ...(profileIds.length ? [{ patronType: 'other', sourceId: { [Op.in]: profileIds } }] : []),
            ],
        },
        order: [['name', 'ASC']],
        limit,
    });
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    // Visitor rows whose profile matched by contact detail need the profile
    // for the DTO even when the name did not match.
    const missing = rows.filter((r) => r.patronType === 'other' && !profileById.has(r.sourceId)).map((r) => r.sourceId);
    if (missing.length) {
        const extra = await OtherPatron.findAll({ where: { id: { [Op.in]: missing } }, attributes: ['id', 'name', 'identityNo', 'mobile', 'email'] });
        for (const e of extra) profileById.set(e.id, e);
    }
    return rows.map((r) => dto(r, r.patronType === 'other' ? profileById.get(r.sourceId) || null : null));
}

// Patron rows by id, as a Map.
async function byIds(companyId, ids, { transaction } = {}) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    const rows = await Patron.findAll({ where: { companyId, id: { [Op.in]: unique } }, transaction });
    return new Map(rows.map((r) => [r.id, r]));
}

// The visitor profiles behind a set of Patron rows, keyed by patron id.
async function profilesFor(companyId, patrons, { transaction } = {}) {
    const ids = [...new Set(patrons.filter((p) => p && p.patronType === 'other').map((p) => p.sourceId))];
    if (!ids.length) return new Map();
    const profiles = await OtherPatron.findAll({ where: { companyId, id: { [Op.in]: ids } }, transaction });
    const byProfile = new Map(profiles.map((p) => [p.id, p]));
    const out = new Map();
    for (const p of patrons) if (p && p.patronType === 'other' && byProfile.has(p.sourceId)) out.set(p.id, byProfile.get(p.sourceId));
    return out;
}

module.exports = { dto, ensureMemberPatron, ensureOtherPatron, search, byIds, profilesFor };
