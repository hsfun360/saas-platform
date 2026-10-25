// Slot sets of a SLOT-mode Facility Type (/facility/facility-types, the
// type drawer's Slot sets section). Every request scopes through the parent
// type (active company + :id). Create generates and stores the slots from the
// header in one transaction (the dialog previews them first through
// /preview); the slot list is then hand-adjusted and PUT-replaced; PATCH with
// `regenerate: true` rebuilds the slots from the changed header.

const { sequelize } = require('../../platform/db');
const FacilityType = require('./facilityType.model');
const FacilityTypeSlotSet = require('./facilityTypeSlotSet.model');
const FacilityTypeSlot = require('./facilityTypeSlot.model');
const { getUserContext } = require('../../platform/serviceContext');
const { DAY_SCOPE_KEYS, LIMITS } = require('./facility.constants');
const { companyIdOf, stampsFor, normalizeTime, timeDto, DATE_RE, parseRequiredInt } = require('./facilityShared');
const { generateSlots } = require('./slotSet.service');

async function findOwnedType(req) {
    const companyId = companyIdOf(req);
    if (!companyId) return { status: 400, message: 'Select a workspace first.' };
    const type = await FacilityType.findOne({ where: { id: req.params.id, companyId } });
    if (!type) return { status: 404, message: 'Facility type not found.' };
    return { type };
}

async function findOwnedSet(req) {
    const target = await findOwnedType(req);
    if (target.status) return target;
    const set = await FacilityTypeSlotSet.findOne({ where: { id: req.params.setId, facilityTypeId: target.type.id } });
    if (!set) return { status: 404, message: 'Slot set not found.' };
    return { type: target.type, set };
}

function slotDto(s) {
    const p = s.get ? s.get({ plain: true }) : s;
    return { ...p, startTime: timeDto(p.startTime), endTime: timeDto(p.endTime) };
}

function setDto(set) {
    const p = set.get ? set.get({ plain: true }) : set;
    return {
        ...p,
        firstSlotTime: timeDto(p.firstSlotTime),
        lastSlotTime: timeDto(p.lastSlotTime),
        frontDeskFrom: timeDto(p.frontDeskFrom),
        slots: (p.Slots || p.slots || []).map(slotDto),
        Slots: undefined,
    };
}

function listQuery(facilityTypeId) {
    return FacilityTypeSlotSet.findAll({
        where: { facilityTypeId },
        include: [{ model: FacilityTypeSlot, as: 'Slots' }],
        order: [['dayScope', 'ASC'], ['effectiveDate', 'DESC'], [{ model: FacilityTypeSlot, as: 'Slots' }, 'slotNumber', 'ASC']],
    });
}

// Validate the header fields present in `body`; `current` supplies the rest.
function validateHeader(body, current) {
    const out = {};
    if ('description' in body) out.description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null;
    if ('dayScope' in body) {
        const dayScope = String(body.dayScope || '').trim();
        if (!DAY_SCOPE_KEYS.includes(dayScope)) return { error: 'Day scope must be All days, Weekdays or Weekends.' };
        out.dayScope = dayScope;
    }
    if ('effectiveDate' in body) {
        const d = String(body.effectiveDate || '').trim();
        if (!DATE_RE.test(d)) return { error: 'Effective date is required (YYYY-MM-DD).' };
        out.effectiveDate = d;
    }
    for (const [field, label, required] of [['firstSlotTime', 'First slot', true], ['lastSlotTime', 'Last slot', true], ['frontDeskFrom', 'Front desk from', false]]) {
        if (!(field in body)) continue;
        const t = normalizeTime(body[field]);
        if (!t.ok || (required && t.value === null)) return { error: `${label} time must be a valid time (HH:MM).` };
        out[field] = t.value;
    }
    if ('slotMinutes' in body) {
        const n = parseRequiredInt(body.slotMinutes, LIMITS.slotMinutesMin, LIMITS.slotMinutesMax);
        if (!n.ok) return { error: `Slot length must be a whole number of minutes between ${LIMITS.slotMinutesMin} and ${LIMITS.slotMinutesMax}.` };
        out.slotMinutes = n.value;
    }
    const merged = { ...(current ? current.get({ plain: true }) : {}), ...out };
    if (merged.firstSlotTime && merged.lastSlotTime && merged.slotMinutes) {
        const gen = generateSlots(merged);
        if (gen.error) return { error: gen.error };
        return { values: out, slots: gen.slots };
    }
    return { values: out, slots: null };
}

const REQUIRED = ['dayScope', 'effectiveDate', 'firstSlotTime', 'lastSlotTime', 'slotMinutes'];
function missingRequired(body) {
    return REQUIRED.some((f) => !(f in body) || body[f] === null || body[f] === '');
}

// GET /api/facility/facility-types/:id/slot-sets
exports.list = async (req, res) => {
    try {
        const target = await findOwnedType(req);
        if (target.status) return res.status(target.status).json({ message: target.message });
        const sets = await listQuery(target.type.id);
        res.status(200).json(sets.map(setDto));
    } catch (error) {
        console.error('Error listing slot sets:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/facility-types/:id/slot-sets/preview - the slots the
// header would generate (nothing saved).
exports.preview = async (req, res) => {
    try {
        const target = await findOwnedType(req);
        if (target.status) return res.status(target.status).json({ message: target.message });
        if (missingRequired(req.body)) return res.status(400).json({ message: 'Day scope, effective date, first and last slot and slot length are required.' });
        const header = validateHeader(req.body, null);
        if (header.error) return res.status(400).json({ message: header.error });
        res.status(200).json({ slots: header.slots.map(slotDto) });
    } catch (error) {
        console.error('Error previewing slot set:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/facility-types/:id/slot-sets - header + generated slots.
exports.create = async (req, res) => {
    try {
        const target = await findOwnedType(req);
        if (target.status) return res.status(target.status).json({ message: target.message });
        if (target.type.usageMode !== 'slot') return res.status(400).json({ message: `${target.type.code} is not a time-slot facility type.` });
        if (missingRequired(req.body)) return res.status(400).json({ message: 'Day scope, effective date, first and last slot and slot length are required.' });
        const header = validateHeader(req.body, null);
        if (header.error) return res.status(400).json({ message: header.error });

        const clash = await FacilityTypeSlotSet.findOne({ where: { facilityTypeId: target.type.id, dayScope: header.values.dayScope, effectiveDate: header.values.effectiveDate } });
        if (clash) return res.status(409).json({ message: 'This facility type already has a slot set for that day scope and effective date.' });

        const stamps = await stampsFor(req);
        const set = await sequelize.transaction(async (t) => {
            const created = await FacilityTypeSlotSet.create({ ...header.values, facilityTypeId: target.type.id, ...stamps }, { transaction: t });
            await FacilityTypeSlot.bulkCreate(header.slots.map((s) => ({ ...s, slotSetId: created.id })), { transaction: t });
            return created;
        });
        const full = await FacilityTypeSlotSet.findOne({ where: { id: set.id }, include: [{ model: FacilityTypeSlot, as: 'Slots' }], order: [[{ model: FacilityTypeSlot, as: 'Slots' }, 'slotNumber', 'ASC']] });
        res.status(201).json({ message: `Slot set created with ${header.slots.length} slots.`, set: setDto(full) });
    } catch (error) {
        console.error('Error creating slot set:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/facility/facility-types/:id/slot-sets/:setId - header fields,
// isActive, and `regenerate: true` to rebuild the slots from the header.
exports.update = async (req, res) => {
    try {
        const target = await findOwnedSet(req);
        if (target.status) return res.status(target.status).json({ message: target.message });
        const set = target.set;
        const header = validateHeader(req.body, set);
        if (header.error) return res.status(400).json({ message: header.error });

        const nextScope = header.values.dayScope ?? set.dayScope;
        const nextDate = header.values.effectiveDate ?? set.effectiveDate;
        if (nextScope !== set.dayScope || String(nextDate) !== String(set.effectiveDate)) {
            const clash = await FacilityTypeSlotSet.findOne({ where: { facilityTypeId: set.facilityTypeId, dayScope: nextScope, effectiveDate: nextDate } });
            if (clash && clash.id !== set.id) return res.status(409).json({ message: 'This facility type already has a slot set for that day scope and effective date.' });
        }

        Object.assign(set, header.values, { updatedBy: getUserContext(req).userId });
        if (typeof req.body.isActive === 'boolean') set.isActive = req.body.isActive;
        await sequelize.transaction(async (t) => {
            await set.save({ transaction: t });
            if (req.body.regenerate === true && header.slots) {
                await FacilityTypeSlot.destroy({ where: { slotSetId: set.id }, transaction: t });
                await FacilityTypeSlot.bulkCreate(header.slots.map((s) => ({ ...s, slotSetId: set.id })), { transaction: t });
            }
        });
        const full = await FacilityTypeSlotSet.findOne({ where: { id: set.id }, include: [{ model: FacilityTypeSlot, as: 'Slots' }], order: [[{ model: FacilityTypeSlot, as: 'Slots' }, 'slotNumber', 'ASC']] });
        res.status(200).json({ message: req.body.regenerate === true ? 'Slot set updated and slots regenerated.' : 'Slot set updated.', set: setDto(full) });
    } catch (error) {
        console.error('Error updating slot set:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/facility/facility-types/:id/slot-sets/:setId/slots - replace the
// slot list atomically (hand-adjusted on the screen).
exports.saveSlots = async (req, res) => {
    try {
        const target = await findOwnedSet(req);
        if (target.status) return res.status(target.status).json({ message: target.message });
        const set = target.set;
        const raw = Array.isArray(req.body.slots) ? req.body.slots : [];
        if (raw.length > LIMITS.maxSlotsPerSet) return res.status(400).json({ message: `A slot set cannot have more than ${LIMITS.maxSlotsPerSet} slots.` });

        const rows = [];
        const seen = new Set();
        for (const s of raw) {
            const slotNumber = Number(s.slotNumber);
            if (!Number.isInteger(slotNumber) || slotNumber < 1 || slotNumber > 999) return res.status(400).json({ message: 'Every slot needs a number between 1 and 999.' });
            if (seen.has(slotNumber)) return res.status(400).json({ message: `Slot number ${slotNumber} appears more than once.` });
            seen.add(slotNumber);
            const start = normalizeTime(s.startTime);
            const end = normalizeTime(s.endTime);
            if (!start.ok || !start.value || !end.ok || !end.value) return res.status(400).json({ message: `Slot ${slotNumber}: start and end must be valid times (HH:MM).` });
            if (start.value >= end.value) return res.status(400).json({ message: `Slot ${slotNumber}: the end must be after the start.` });
            rows.push({ slotSetId: set.id, slotNumber, startTime: start.value, endTime: end.value, isFrontDesk: s.isFrontDesk === true, isActive: s.isActive !== false });
        }
        rows.sort((a, b) => a.slotNumber - b.slotNumber);
        for (let i = 1; i < rows.length; i += 1) {
            if (rows[i].startTime < rows[i - 1].endTime) return res.status(400).json({ message: `Slots ${rows[i - 1].slotNumber} and ${rows[i].slotNumber} overlap.` });
        }

        await sequelize.transaction(async (t) => {
            await FacilityTypeSlot.destroy({ where: { slotSetId: set.id }, transaction: t });
            if (rows.length) await FacilityTypeSlot.bulkCreate(rows, { transaction: t });
            set.updatedBy = getUserContext(req).userId;
            await set.save({ transaction: t });
        });
        const slots = await FacilityTypeSlot.findAll({ where: { slotSetId: set.id }, order: [['slotNumber', 'ASC']] });
        res.status(200).json({ message: `${slots.length} slot${slots.length === 1 ? '' : 's'} saved.`, slots: slots.map(slotDto) });
    } catch (error) {
        console.error('Error saving slots:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/facility/facility-types/:id/slot-sets/:setId (slots cascade).
// Slice 2 adds the "in use by bookings" guard.
exports.remove = async (req, res) => {
    try {
        const target = await findOwnedSet(req);
        if (target.status) return res.status(target.status).json({ message: target.message });
        await target.set.destroy();
        res.status(200).json({ message: 'Slot set deleted.' });
    } catch (error) {
        console.error('Error deleting slot set:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
