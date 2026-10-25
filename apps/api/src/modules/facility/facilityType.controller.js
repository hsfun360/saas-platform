// Facility Types master (/facility/facility-types; structure approved
// 2026-10-25). The kind of facility and its rules; the usage mode decides
// which rule group applies and is frozen once a Facility exists under the
// type. Fields of the other modes are normalised to their defaults on save so
// a mode switch never leaves stale rules behind.

const { Storage } = require('@google-cloud/storage');
const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const FacilityType = require('./facilityType.model');
const FacilityTypeSlotSet = require('./facilityTypeSlotSet.model');
const Facility = require('./facility.model');
const { getUserContext } = require('../../platform/serviceContext');
const { USAGE_MODES, USAGE_MODE_KEYS, DAY_SCOPES, LIMITS } = require('./facility.constants');
const { companyIdOf, stampsFor, normalizeTime, timeDto, parseOptionalInt, parseRequiredInt } = require('./facilityShared');

// Public image uploads go to the per-environment bucket named by ASSETS_BUCKET
// (same flow as the golf course photo). Resolved lazily so a missing var fails
// the one upload request, not the whole API.
const storage = new Storage();
function assetsBucket() {
    const name = process.env.ASSETS_BUCKET;
    if (!name) throw new Error('ASSETS_BUCKET env var is not set - cannot store uploads.');
    return storage.bucket(name);
}

const CODE_RE = /^[A-Z0-9_]{1,20}$/;

function typeDto(row, counts = {}) {
    const t = row.get ? row.get({ plain: true }) : row;
    return {
        ...t,
        openTimeWeekday: timeDto(t.openTimeWeekday),
        closeTimeWeekday: timeDto(t.closeTimeWeekday),
        openTimeWeekend: timeDto(t.openTimeWeekend),
        closeTimeWeekend: timeDto(t.closeTimeWeekend),
        unitCount: counts.unitCount || 0,
        activeUnitCount: counts.activeUnitCount || 0,
        slotSetCount: counts.slotSetCount || 0,
    };
}

// Validate the fields present in `body`; `current` (update) supplies the rest
// for cross-checks and the mode normalisation. Returns { error } or { values }.
function validateType(body, current) {
    const out = {};

    if ('code' in body) {
        const code = String(body.code || '').trim().toUpperCase();
        if (!CODE_RE.test(code)) return { error: 'Code is required: 1-20 characters, letters, digits and underscores only.' };
        out.code = code;
    }
    if ('description' in body) {
        const description = typeof body.description === 'string' ? body.description.trim() : '';
        if (!description) return { error: 'Description is required.' };
        out.description = description;
    }
    if ('usageMode' in body) {
        const usageMode = String(body.usageMode || '').trim();
        if (!USAGE_MODE_KEYS.includes(usageMode)) return { error: 'Usage mode must be Time slot booking, Entry registration or Issue and return.' };
        out.usageMode = usageMode;
    }
    if ('iconUrl' in body) out.iconUrl = typeof body.iconUrl === 'string' && body.iconUrl.trim() ? body.iconUrl.trim() : null;
    if ('sortOrder' in body) {
        const n = parseRequiredInt(body.sortOrder, 0, 9999);
        if (!n.ok) return { error: 'Sort order must be a whole number between 0 and 9999.' };
        out.sortOrder = n.value;
    }
    if (typeof body.isActive === 'boolean') out.isActive = body.isActive;

    const optionalInts = [
        ['maxParticipants', 1, 500, 'Max participants must be a whole number between 1 and 500, or blank.'],
        ['advanceBookingDays', 0, 365, 'Advance booking days must be a whole number between 0 and 365, or blank for the general rule.'],
        ['capacity', 1, 100000, 'Capacity must be a whole number between 1 and 100000, or blank for unlimited.'],
        ['maxGuestsPerBooking', 0, 100, 'Max guests must be a whole number between 0 and 100, or blank for no limit.'],
    ];
    for (const [field, min, max, message] of optionalInts) {
        if (!(field in body)) continue;
        const n = parseOptionalInt(body[field], min, max);
        if (!n.ok) return { error: message };
        out[field] = n.value;
    }
    const requiredInts = [
        ['minParticipants', 1, 500, 'Min participants must be a whole number between 1 and 500.'],
        ['maxSlotsPerDayWeekday', 0, 50, 'Weekday slots per day must be a whole number between 0 and 50 (0 = no limit).'],
        ['maxSlotsPerDayWeekend', 0, 50, 'Weekend slots per day must be a whole number between 0 and 50 (0 = no limit).'],
        ['maxConsecutiveSlots', 0, 50, 'Max consecutive slots must be a whole number between 0 and 50 (0 = no limit).'],
        ['maxIssuePerPatron', 0, 100, 'Max issue per patron must be a whole number between 0 and 100 (0 = no limit).'],
    ];
    for (const [field, min, max, message] of requiredInts) {
        if (!(field in body)) continue;
        const n = parseRequiredInt(body[field], min, max);
        if (!n.ok) return { error: message };
        out[field] = n.value;
    }
    for (const flag of ['trackUnits', 'guestsAllowed', 'memberGuestsAllowed', 'hostMustBePresent', 'requiresApproval']) {
        if (typeof body[flag] === 'boolean') out[flag] = body[flag];
    }
    // Slice 2 default fees: value refs checked against the catalog in the
    // create / update paths (validateDefaultFees); '' clears.
    for (const field of ['feeTransactionTypeId', 'guestFeeTransactionTypeId']) {
        if (field in body) out[field] = typeof body[field] === 'string' && body[field].trim() ? body[field].trim() : null;
    }
    for (const field of ['openTimeWeekday', 'closeTimeWeekday', 'openTimeWeekend', 'closeTimeWeekend']) {
        if (!(field in body)) continue;
        const t = normalizeTime(body[field]);
        if (!t.ok) return { error: 'Opening hours must be valid times (HH:MM).' };
        out[field] = t.value;
    }

    // Cross-checks on the intended (merged) state.
    const merged = { ...(current ? current.get({ plain: true }) : {}), ...out };
    if (merged.maxParticipants !== null && merged.maxParticipants !== undefined && merged.minParticipants > merged.maxParticipants) {
        return { error: 'Min participants cannot exceed max participants.' };
    }
    for (const [open, close, label] of [['openTimeWeekday', 'closeTimeWeekday', 'Weekday'], ['openTimeWeekend', 'closeTimeWeekend', 'Weekend']]) {
        const o = merged[open] || null;
        const c = merged[close] || null;
        if ((o === null) !== (c === null)) return { error: `${label} opening hours need both an open and a close time, or neither.` };
        if (o && c && String(o) >= String(c)) return { error: `${label} close time must be after the open time.` };
    }

    // Mode normalisation: the other modes' rule groups go back to defaults.
    const mode = merged.usageMode;
    if (mode && mode !== 'slot') {
        Object.assign(out, { maxParticipants: null, minParticipants: 1, maxSlotsPerDayWeekday: 0, maxSlotsPerDayWeekend: 0, maxConsecutiveSlots: 0, advanceBookingDays: null });
    }
    if (mode && mode !== 'entry') out.capacity = null;
    if (mode && mode !== 'issue') Object.assign(out, { trackUnits: true, maxIssuePerPatron: 1 });
    if (mode === 'slot') Object.assign(out, { openTimeWeekday: null, closeTimeWeekday: null, openTimeWeekend: null, closeTimeWeekend: null });

    return { values: out };
}

// The default fee pickers (slice 2): each must be an active transaction type
// of the company with the matching charge type, belonging to THIS facility
// type or to any type. Returns an error string or null.
async function validateDefaultFees(companyId, values, selfId) {
    const TransactionType = require('./transactionType.model');
    const checks = [
        ['feeTransactionTypeId', 'facility-fee', 'Facility fee default'],
        ['guestFeeTransactionTypeId', 'guest-fee', 'Guest fee default'],
    ];
    for (const [field, chargeType, label] of checks) {
        const id = values[field];
        if (!id) continue;
        const tt = await TransactionType.findOne({ where: { id, companyId } });
        if (!tt) return `${label}: pick a transaction type of the active company.`;
        if (tt.chargeType !== chargeType) return `${label}: '${tt.transactionType}' is not a ${chargeType === 'guest-fee' ? 'guest fee' : 'facility fee'}.`;
        if (tt.isActive === false) return `${label}: '${tt.transactionType}' is disabled.`;
        if (tt.facilityTypeId && selfId && tt.facilityTypeId !== selfId) return `${label}: '${tt.transactionType}' belongs to another facility type.`;
    }
    return null;
}

async function countsByType(companyId) {
    const [units, sets] = await Promise.all([
        Facility.findAll({
            where: { companyId },
            attributes: ['facilityTypeId', [sequelize.fn('COUNT', sequelize.col('id')), 'n'], [sequelize.fn('SUM', sequelize.literal('CASE WHEN "isActive" THEN 1 ELSE 0 END')), 'active']],
            group: ['facilityTypeId'],
            raw: true,
        }),
        FacilityTypeSlotSet.findAll({
            attributes: ['facilityTypeId', [sequelize.fn('COUNT', sequelize.col('FacilityTypeSlotSet.id')), 'n']],
            include: [{ model: FacilityType, as: 'FacilityType', attributes: [], where: { companyId } }],
            group: ['FacilityTypeSlotSet.facilityTypeId'],
            raw: true,
        }),
    ]);
    const map = new Map();
    for (const u of units) map.set(u.facilityTypeId, { unitCount: Number(u.n), activeUnitCount: Number(u.active || 0), slotSetCount: 0 });
    for (const s of sets) {
        const c = map.get(s.facilityTypeId) || { unitCount: 0, activeUnitCount: 0, slotSetCount: 0 };
        c.slotSetCount = Number(s.n);
        map.set(s.facilityTypeId, c);
    }
    return map;
}

// GET /api/facility/meta - vocabularies for every slice-1 screen.
exports.getMeta = async (req, res) => {
    res.status(200).json({ usageModes: USAGE_MODES, dayScopes: DAY_SCOPES, limits: LIMITS });
};

// GET /api/facility/facility-types
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const [rows, counts] = await Promise.all([
            FacilityType.findAll({ where: { companyId }, order: [['sortOrder', 'ASC'], ['code', 'ASC']] }),
            countsByType(companyId),
        ]);
        res.status(200).json(rows.map((r) => typeDto(r, counts.get(r.id))));
    } catch (error) {
        console.error('Error listing facility types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/facility-types
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        for (const f of ['code', 'description', 'usageMode']) {
            if (!(f in req.body) || req.body[f] === null || req.body[f] === '') {
                return res.status(400).json({ message: 'Code, description and usage mode are required.' });
            }
        }
        const v = validateType(req.body, null);
        if (v.error) return res.status(400).json({ message: v.error });

        const clash = await FacilityType.findOne({ where: { companyId, code: v.values.code } });
        if (clash) return res.status(409).json({ message: `Facility type '${v.values.code}' already exists.` });
        const feeErr = await validateDefaultFees(companyId, v.values, null);
        if (feeErr) return res.status(400).json({ message: feeErr });

        const stamps = await stampsFor(req);
        const row = await FacilityType.create({ companyId, ...v.values, ...stamps });
        res.status(201).json({ message: 'Facility type created.', facilityType: typeDto(row) });
    } catch (error) {
        console.error('Error creating facility type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/facility/facility-types/:id
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await FacilityType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Facility type not found.' });

        const v = validateType(req.body, row);
        if (v.error) return res.status(400).json({ message: v.error });

        if (v.values.code && v.values.code !== row.code) {
            const clash = await FacilityType.findOne({ where: { companyId, code: v.values.code, id: { [Op.ne]: row.id } } });
            if (clash) return res.status(409).json({ message: `Facility type '${v.values.code}' already exists.` });
        }
        if (v.values.usageMode && v.values.usageMode !== row.usageMode) {
            const units = await Facility.count({ where: { facilityTypeId: row.id } });
            if (units) return res.status(409).json({ message: `Usage mode is frozen: ${units} facilit${units === 1 ? 'y' : 'ies'} already exist under ${row.code}.` });
            const sets = await FacilityTypeSlotSet.count({ where: { facilityTypeId: row.id } });
            if (sets && v.values.usageMode !== 'slot') return res.status(409).json({ message: `Delete the ${sets} slot set${sets === 1 ? '' : 's'} of ${row.code} before changing its usage mode.` });
        }

        const feeErr = await validateDefaultFees(companyId, v.values, row.id);
        if (feeErr) return res.status(400).json({ message: feeErr });

        Object.assign(row, v.values, { updatedBy: getUserContext(req).userId });
        await row.save();
        const counts = await countsByType(companyId);
        res.status(200).json({ message: 'Facility type updated.', facilityType: typeDto(row, counts.get(row.id)) });
    } catch (error) {
        console.error('Error updating facility type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/facility/facility-types/:id - refused while units exist (slot
// sets and closure plans cascade).
exports.remove = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await FacilityType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Facility type not found.' });
        const units = await Facility.count({ where: { facilityTypeId: row.id } });
        if (units) return res.status(409).json({ message: `Cannot delete ${row.code} - ${units} facilit${units === 1 ? 'y' : 'ies'} still belong to it. Delete those first.` });
        await row.destroy();
        res.status(200).json({ message: `Facility type ${row.code} deleted.` });
    } catch (error) {
        console.error('Error deleting facility type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/facility-types/icon (multipart 'icon') -> { url }
exports.uploadIcon = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        if (!req.file) return res.status(400).json({ message: 'No image file uploaded.' });
        const bucket = assetsBucket();
        const ext = req.file.originalname.split('.').pop();
        const blob = bucket.file(`facility-type-${companyId}-${Date.now()}.${ext}`);
        await blob.save(req.file.buffer, { resumable: false, contentType: req.file.mimetype });
        res.status(200).json({ message: 'Icon uploaded.', url: `https://storage.googleapis.com/${bucket.name}/${blob.name}` });
    } catch (error) {
        console.error('Facility type icon upload error:', error);
        res.status(500).json({ message: error.message || 'Failed to upload icon.' });
    }
};

exports.validateType = validateType;
