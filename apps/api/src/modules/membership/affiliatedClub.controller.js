// Affiliated / Reciprocal Club master file (Membership Management → Common
// Setup → Affiliated Clubs; user decisions 2026-10-15 / 16). The other clubs
// and associations whose members this club admits, with the arrangement's
// terms the visit document and the desks enforce. The golf-side pickers (the
// affiliate player type its visitors are billed as, the visit fee item) are
// read through platform/golfGateway.js - never the golf models.

const { Op } = require('sequelize');
const AffiliatedClub = require('./affiliatedClub.model');
const AffiliatedVisit = require('./affiliatedVisit.model');
const {
    getUserContext,
    getCallerPlacement,
    canModifyRecord,
    annotateCanModify,
} = require('../../platform/serviceContext');
const { withCountryName } = require('../../platform/addressFormat');
const golfGateway = require('../../platform/golfGateway');
const {
    AFFILIATED_CLUB_KINDS, AFFILIATED_CLUB_KIND_KEYS, VISIT_CAP_PERIODS, VISIT_CAP_PERIOD_KEYS,
} = require('./affiliatedClub.constants');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

function str(v) {
    return typeof v === 'string' ? v.trim() : '';
}
function strOrNull(v) {
    const s = str(v);
    return s || null;
}
function intOrNull(v, min, max, label) {
    if (v === null || v === undefined || v === '') return { value: null };
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) return { error: `${label} must be a whole number between ${min} and ${max}.` };
    return { value: n };
}

async function toDto(c, types, feeTypes, canModify = true) {
    const t = types.find((x) => x.id === c.playerTypeId) || null;
    const fee = c.visitFeeTransactionTypeId ? (feeTypes.find((x) => x.id === c.visitFeeTransactionTypeId) || null) : null;
    return {
        id: c.id,
        canModify,
        code: c.code,
        name: c.name,
        kind: c.kind,
        playerTypeId: c.playerTypeId,
        playerTypeCode: t ? t.code : null,
        playerTypeLabel: t ? t.description : null,
        agreementFrom: c.agreementFrom,
        agreementTo: c.agreementTo,
        allowChargeToHomeClub: c.allowChargeToHomeClub === true,
        maxGuestsPerVisit: c.maxGuestsPerVisit,
        maxVisitsPerPlayer: c.maxVisitsPerPlayer,
        maxVisitsPeriod: c.maxVisitsPeriod,
        maxVisitsPerYear: c.maxVisitsPerYear,
        visitFeeTransactionTypeId: c.visitFeeTransactionTypeId,
        visitFeeLabel: fee ? `${fee.transactionType}${fee.description ? ' - ' + fee.description : ''}` : null,
        requiresApproval: c.requiresApproval === true,
        contactName: c.contactName,
        contactEmail: c.contactEmail,
        contactPhone: c.contactPhone,
        address: await withCountryName({
            line1: c.addressLine1, line2: c.addressLine2, city: c.city, state: c.state, postcode: c.postalCode, countryCode: c.countryCode,
        }),
        remarks: c.remarks,
        isActive: c.isActive !== false,
        sortOrder: c.sortOrder,
    };
}

// Validate + normalise a payload against the golf pickers. Returns { value }
// or { error }.
function normalizeBody(body, types, feeTypes) {
    const code = str(body.code).toUpperCase();
    if (!code) return { error: 'Code is required.' };
    if (code.length > 20) return { error: 'Code must be 20 characters or fewer.' };
    if (!/^[A-Z0-9][A-Z0-9-]*$/.test(code)) return { error: 'Code may only contain letters, digits and hyphens.' };
    const name = str(body.name);
    if (!name) return { error: 'Name is required.' };
    const kind = str(body.kind);
    if (!AFFILIATED_CLUB_KIND_KEYS.includes(kind)) return { error: 'Select whether this is an affiliated association or a reciprocal club.' };
    const playerTypeId = str(body.playerTypeId);
    const type = types.find((t) => t.id === playerTypeId);
    if (!type) return { error: 'Pick the golf player type this club\'s visitors are billed as.' };
    if (type.isActive === false) return { error: `Player type '${type.code}' is disabled - enable it or pick another.` };
    const visitFeeTransactionTypeId = strOrNull(body.visitFeeTransactionTypeId);
    if (visitFeeTransactionTypeId) {
        const fee = feeTypes.find((f) => f.id === visitFeeTransactionTypeId);
        if (!fee) return { error: 'The visit fee must be one of this company\'s miscellaneous golf transaction types.' };
        if (fee.isActive === false) return { error: `Visit fee item '${fee.transactionType}' is disabled - enable it or pick another.` };
    }
    const agreementFrom = strOrNull(body.agreementFrom);
    const agreementTo = strOrNull(body.agreementTo);
    if (agreementFrom && !DATE_RE.test(agreementFrom)) return { error: 'Agreement from must be a date.' };
    if (agreementTo && !DATE_RE.test(agreementTo)) return { error: 'Agreement to must be a date.' };
    if (agreementFrom && agreementTo && agreementTo < agreementFrom) return { error: 'The agreement cannot end before it starts.' };
    const guests = intOrNull(body.maxGuestsPerVisit, 0, 99, 'Guests per visit');
    if (guests.error) return { error: guests.error };
    const visits = intOrNull(body.maxVisitsPerPlayer, 1, 999, 'Visits per member');
    if (visits.error) return { error: visits.error };
    let maxVisitsPeriod = strOrNull(body.maxVisitsPeriod);
    if (visits.value !== null) {
        if (!VISIT_CAP_PERIOD_KEYS.includes(maxVisitsPeriod)) return { error: 'Pick the period the visit cap counts over.' };
    } else {
        maxVisitsPeriod = null;
    }
    const yearly = intOrNull(body.maxVisitsPerYear, 1, 9999, 'Visits per year (club-wide)');
    if (yearly.error) return { error: yearly.error };
    const contactEmail = strOrNull(body.contactEmail);
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return { error: 'The contact email is not a valid address.' };
    let countryCode = strOrNull(body.countryCode);
    if (countryCode && !/^[A-Za-z]{2}$/.test(countryCode)) return { error: 'Country must be a 2-letter code.' };
    if (countryCode) countryCode = countryCode.toLowerCase();
    const sort = intOrNull(body.sortOrder, 1, 999, 'Sort order');
    if (sort.error) return { error: sort.error };
    return {
        value: {
            code, name, kind, playerTypeId, agreementFrom, agreementTo,
            allowChargeToHomeClub: body.allowChargeToHomeClub === true,
            maxGuestsPerVisit: guests.value,
            maxVisitsPerPlayer: visits.value,
            maxVisitsPeriod,
            maxVisitsPerYear: yearly.value,
            visitFeeTransactionTypeId,
            requiresApproval: body.requiresApproval === true,
            contactName: strOrNull(body.contactName),
            contactEmail,
            contactPhone: strOrNull(body.contactPhone),
            addressLine1: strOrNull(body.addressLine1),
            addressLine2: strOrNull(body.addressLine2),
            city: strOrNull(body.city),
            state: strOrNull(body.state),
            postalCode: strOrNull(body.postalCode),
            countryCode,
            remarks: strOrNull(body.remarks),
            sortOrder: sort.value === null ? 100 : sort.value,
        },
    };
}

async function pickers(companyId) {
    const [types, feeTypes] = await Promise.all([golfGateway.listAffiliatePlayerTypes(companyId), golfGateway.listVisitFeeTypes(companyId)]);
    return { types, feeTypes };
}

// GET /api/membership/affiliated-clubs/meta - the vocabularies + the golf
// pickers (affiliate-base player types, miscellaneous fee items), served
// here through the golf seam so the screen needs no golf grants.
exports.getMeta = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const { types, feeTypes } = await pickers(companyId);
        res.status(200).json({ kinds: AFFILIATED_CLUB_KINDS, periods: VISIT_CAP_PERIODS, playerTypes: types, visitFeeTypes: feeTypes });
    } catch (error) {
        console.error('Error loading affiliated-club meta:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/membership/affiliated-clubs - every club of the company.
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const [rows, { types, feeTypes }] = await Promise.all([
            AffiliatedClub.findAll({ where: { companyId }, order: [['sortOrder', 'ASC'], ['name', 'ASC']] }),
            pickers(companyId),
        ]);
        const flags = await annotateCanModify(req, rows);
        const clubs = [];
        for (let i = 0; i < rows.length; i += 1) clubs.push(await toDto(rows[i], types, feeTypes, flags[i]));
        res.status(200).json({ clubs, kinds: AFFILIATED_CLUB_KINDS, periods: VISIT_CAP_PERIODS });
    } catch (error) {
        console.error('Error listing affiliated clubs:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/membership/affiliated-clubs
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const { types, feeTypes } = await pickers(companyId);
        const parsed = normalizeBody(req.body, types, feeTypes);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        const existing = await AffiliatedClub.findOne({ where: { companyId, code: v.code } });
        if (existing) return res.status(409).json({ message: `Affiliated club '${v.code}' already exists.` });
        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const row = await AffiliatedClub.create({
            companyId, ...v, isActive: true,
            createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId,
        });
        res.status(201).json({ message: `Affiliated club '${row.code}' created.`, club: await toDto(row, types, feeTypes) });
    } catch (error) {
        console.error('Error creating affiliated club:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/membership/affiliated-clubs/:id - full update.
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await AffiliatedClub.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Affiliated club not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }
        const { types, feeTypes } = await pickers(companyId);
        const parsed = normalizeBody(req.body, types, feeTypes);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        if (v.code !== row.code) {
            const clash = await AffiliatedClub.findOne({ where: { companyId, code: v.code, id: { [Op.ne]: row.id } } });
            if (clash) return res.status(409).json({ message: `Affiliated club '${v.code}' already exists.` });
        }
        Object.assign(row, v);
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        res.status(200).json({ message: `Affiliated club '${row.code}' updated.`, club: await toDto(row, types, feeTypes) });
    } catch (error) {
        console.error('Error updating affiliated club:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/membership/affiliated-clubs/:id - toggle isActive only.
exports.setActive = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await AffiliatedClub.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Affiliated club not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }
        if (typeof req.body.isActive === 'boolean') {
            row.isActive = req.body.isActive;
            row.updatedBy = getUserContext(req).userId;
            await row.save();
        }
        const { types, feeTypes } = await pickers(companyId);
        res.status(200).json({ message: `Affiliated club '${row.code}' updated.`, club: await toDto(row, types, feeTypes) });
    } catch (error) {
        console.error('Error updating affiliated club:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/membership/affiliated-clubs/:id - a club with no visit on record.
exports.remove = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await AffiliatedClub.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Affiliated club not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }
        const visitCount = await AffiliatedVisit.count({ where: { companyId, affiliatedClubId: row.id } });
        if (visitCount) return res.status(409).json({ message: `Affiliated club '${row.code}' has ${visitCount} visit(s) on record - disable it instead.` });
        await row.destroy();
        res.status(200).json({ message: `Affiliated club '${row.code}' deleted.` });
    } catch (error) {
        console.error('Error deleting affiliated club:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
