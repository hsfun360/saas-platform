// Venues master (/facility/venues; slice 5, structure approved 2026-10-26) -
// where a class is held: a place of its own with an OPTIONAL link to one
// facility unit. The link decides the blocking (a slot-type unit is blocked
// whole while a session runs, an entry-type unit and an unlinked venue block
// nothing), so the listing states it per venue. The code and the link are
// frozen once a session references the venue.

const { Op } = require('sequelize');
const FacilityVenue = require('./venue.model');
const Facility = require('./facility.model');
const FacilityType = require('./facilityType.model');
const FacilityClass = require('./class.model');
const FacilityClassSchedule = require('./classSchedule.model');
const FacilityClassSession = require('./classSession.model');
const { sequelize } = require('../../platform/db');
const { getUserContext } = require('../../platform/serviceContext');
const { LIMITS } = require('./facility.constants');
const { companyIdOf, stampsFor, parseRequiredInt } = require('./facilityShared');
const { VENUE_INCLUDE, venueBlocksUnit } = require('./classSchedule.service');

const CODE_RE = /^[A-Z0-9_-]{1,20}$/;

// What the link means for booking, in words the drawer shows under the picker.
function blockingText(venue) {
    const unit = venue && venue.Facility;
    if (!unit) return 'Not a facility - nothing is blocked while a session runs.';
    const type = unit.FacilityType;
    if (type && type.usageMode === 'slot') return `Blocks the whole of ${unit.code} on the booking grid while a session runs.`;
    return `Takes part of ${unit.code} - nothing is blocked, the door count stays its own.`;
}

function venueDto(row, counts = {}) {
    const p = row.get ? row.get({ plain: true }) : row;
    const unit = p.Facility || null;
    const type = unit ? unit.FacilityType : null;
    return {
        ...p,
        Facility: undefined,
        facility: unit ? { id: unit.id, code: unit.code, name: unit.name, usageMode: type ? type.usageMode : null, facilityTypeCode: type ? type.code : null } : null,
        blocksUnit: venueBlocksUnit(row),
        blockingText: blockingText(row),
        sessionCount: counts.sessionCount || 0,
        classCount: counts.classCount || 0,
    };
}

// Validate the fields present in `body`. Returns { error } or { values }.
function validateVenue(body) {
    const out = {};
    if ('code' in body) {
        const code = String(body.code || '').trim().toUpperCase();
        if (!CODE_RE.test(code)) return { error: 'Code is required: 1-20 characters, letters, digits, underscores and hyphens only.' };
        out.code = code;
    }
    if ('name' in body) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) return { error: 'Name is required.' };
        out.name = name;
    }
    for (const field of ['description', 'location', 'remarks']) {
        if (field in body) out[field] = typeof body[field] === 'string' && body[field].trim() ? body[field].trim() : null;
    }
    if ('facilityId' in body) out.facilityId = typeof body.facilityId === 'string' && body.facilityId.trim() ? body.facilityId.trim() : null;
    if ('capacity' in body) {
        const n = parseRequiredInt(body.capacity, 1, LIMITS.maxVenueCapacity);
        if (!n.ok) return { error: `Capacity must be a whole number between 1 and ${LIMITS.maxVenueCapacity}.` };
        out.capacity = n.value;
    }
    if (typeof body.isActive === 'boolean') out.isActive = body.isActive;
    return { values: out };
}

async function countsByVenue(companyId) {
    const [sessions, classes] = await Promise.all([
        FacilityClassSession.findAll({ where: { companyId }, attributes: ['venueId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: ['venueId'], raw: true }),
        FacilityClass.findAll({ where: { companyId, venueId: { [Op.ne]: null } }, attributes: ['venueId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: ['venueId'], raw: true }),
    ]);
    const map = new Map();
    for (const s of sessions) map.set(s.venueId, { sessionCount: Number(s.n), classCount: 0 });
    for (const c of classes) {
        const cur = map.get(c.venueId) || { sessionCount: 0, classCount: 0 };
        cur.classCount = Number(c.n);
        map.set(c.venueId, cur);
    }
    return map;
}

async function findUnit(companyId, facilityId) {
    return Facility.findOne({ where: { id: facilityId, companyId }, include: [{ model: FacilityType, as: 'FacilityType', attributes: ['id', 'code', 'usageMode'] }] });
}

// GET /api/facility/venues - every venue with its link and counts, plus the
// active units for the picker (any type).
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const [rows, counts, units] = await Promise.all([
            FacilityVenue.findAll({ where: { companyId }, include: VENUE_INCLUDE, order: [['code', 'ASC']] }),
            countsByVenue(companyId),
            Facility.findAll({
                where: { companyId, isActive: true },
                attributes: ['id', 'code', 'name'],
                include: [{ model: FacilityType, as: 'FacilityType', attributes: ['id', 'code', 'usageMode'], where: { isActive: true } }],
                order: [['code', 'ASC']],
            }),
        ]);
        res.status(200).json({
            venues: rows.map((r) => venueDto(r, counts.get(r.id))),
            facilities: units.map((u) => ({ id: u.id, code: u.code, name: u.name, usageMode: u.FacilityType.usageMode, facilityTypeCode: u.FacilityType.code })),
        });
    } catch (error) {
        console.error('Error listing facility venues:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/venues
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        for (const f of ['code', 'name', 'capacity']) {
            if (!(f in req.body) || req.body[f] === null || req.body[f] === '') return res.status(400).json({ message: 'Code, name and capacity are required.' });
        }
        const v = validateVenue(req.body);
        if (v.error) return res.status(400).json({ message: v.error });
        if (v.values.facilityId) {
            const unit = await findUnit(companyId, v.values.facilityId);
            if (!unit) return res.status(400).json({ message: 'Pick a facility of the active company, or leave the venue unlinked.' });
        }
        const clash = await FacilityVenue.findOne({ where: { companyId, code: v.values.code } });
        if (clash) return res.status(409).json({ message: `Venue '${v.values.code}' already exists.` });
        const stamps = await stampsFor(req);
        const row = await FacilityVenue.create({ companyId, ...v.values, ...stamps });
        const full = await FacilityVenue.findOne({ where: { id: row.id }, include: VENUE_INCLUDE });
        res.status(201).json({ message: 'Venue created.', venue: venueDto(full) });
    } catch (error) {
        console.error('Error creating facility venue:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/facility/venues/:id - the code and the facility link are frozen
// once a session references the venue.
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await FacilityVenue.findOne({ where: { id: req.params.id, companyId }, include: VENUE_INCLUDE });
        if (!row) return res.status(404).json({ message: 'Venue not found.' });
        const v = validateVenue(req.body);
        if (v.error) return res.status(400).json({ message: v.error });
        const inUse = await FacilityClassSession.count({ where: { venueId: row.id } });
        if (inUse && v.values.code && v.values.code !== row.code) return res.status(409).json({ message: `The code is frozen - ${inUse} session${inUse === 1 ? '' : 's'} already reference ${row.code}.` });
        if (inUse && 'facilityId' in v.values && (v.values.facilityId || null) !== (row.facilityId || null)) {
            return res.status(409).json({ message: `The facility link is frozen - ${inUse} session${inUse === 1 ? '' : 's'} already reference ${row.code}. Retire this venue and create another.` });
        }
        if (v.values.code && v.values.code !== row.code) {
            const clash = await FacilityVenue.findOne({ where: { companyId, code: v.values.code, id: { [Op.ne]: row.id } } });
            if (clash) return res.status(409).json({ message: `Venue '${v.values.code}' already exists.` });
        }
        if (v.values.facilityId) {
            const unit = await findUnit(companyId, v.values.facilityId);
            if (!unit) return res.status(400).json({ message: 'Pick a facility of the active company, or leave the venue unlinked.' });
        }
        Object.assign(row, v.values, { updatedBy: getUserContext(req).userId });
        await row.save();
        const full = await FacilityVenue.findOne({ where: { id: row.id }, include: VENUE_INCLUDE });
        const counts = await countsByVenue(companyId);
        res.status(200).json({ message: 'Venue updated.', venue: venueDto(full, counts.get(row.id)) });
    } catch (error) {
        console.error('Error updating facility venue:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/facility/venues/:id - refused while a class, a schedule or a
// session names it (disable it instead).
exports.remove = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await FacilityVenue.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Venue not found.' });
        const [classes, schedules, sessions] = await Promise.all([
            FacilityClass.count({ where: { venueId: row.id } }),
            FacilityClassSchedule.count({ where: { venueId: row.id } }),
            FacilityClassSession.count({ where: { venueId: row.id } }),
        ]);
        if (classes || schedules || sessions) {
            return res.status(409).json({ message: `Cannot delete ${row.code} - ${classes} class${classes === 1 ? '' : 'es'}, ${schedules} schedule${schedules === 1 ? '' : 's'} and ${sessions} session${sessions === 1 ? '' : 's'} still name it. Disable it to keep it out of use.` });
        }
        await row.destroy();
        res.status(200).json({ message: `Venue ${row.code} deleted.` });
    } catch (error) {
        console.error('Error deleting facility venue:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.venueDto = venueDto;
