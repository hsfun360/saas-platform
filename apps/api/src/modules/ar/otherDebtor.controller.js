// Account Receivable - Other Debtor (city-ledger party master, AR-owned).
//
// Creating one opens its ledger account in the SAME transaction (party row +
// find-or-create Debtor + CreditAccount) - an Other Debtor without a ledger
// account cannot exist. Managed from the shared Debtor Listing screen
// (decision 2026-08-05), so everything gates on the '/ar/debtors' menu.

const { sequelize } = require('../../platform/db');
const OtherDebtor = require('./otherDebtor.model');
const Debtor = require('./debtor.model');
const { provisionDebtor } = require('./debtorProvisioning.service');
const { getUserContext, getCallerPlacement, canModifyRecord } = require('../../platform/serviceContext');
const numberingGateway = require('../../platform/numberingGateway');
const { OTHER_DEBTOR_NUMBERING_PURPOSE } = require('./debtor.controller');

function str(x) { return typeof x === 'string' ? x.trim() : ''; }
function strOrNull(x) { const s = str(x); return s || null; }
function httpError(status, message) { const e = new Error(message); e.httpStatus = status; return e; }

function ownershipStamps(req, placement) {
    const callerId = getUserContext(req).userId;
    return { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
}

// The editable party-profile fields (code is issued/keyed at create and then
// immutable, like every document number in the platform).
function normalizeProfile(body) {
    const v = {
        name: strOrNull(body.name),
        registrationNo: strOrNull(body.registrationNo),
        taxNo: strOrNull(body.taxNo),
        contactPerson: strOrNull(body.contactPerson),
        phone: strOrNull(body.phone),
        mobile: strOrNull(body.mobile),
        fax: strOrNull(body.fax),
        email: strOrNull(body.email),
        address1: strOrNull(body.address1),
        address2: strOrNull(body.address2),
        address3: strOrNull(body.address3),
        city: strOrNull(body.city),
        state: strOrNull(body.state),
        postcode: strOrNull(body.postcode),
        countryCode: strOrNull(body.countryCode),
        remarks: strOrNull(body.remarks),
    };
    if (!v.name) return { error: 'Name is required.' };
    if (v.countryCode && !/^[A-Za-z]{2}$/.test(v.countryCode)) return { error: 'Country must be a 2-letter code.' };
    if (v.countryCode) v.countryCode = v.countryCode.toLowerCase();
    return { value: v };
}

// GET /api/ar/other-debtors/:id - the full party profile (edit dialog).
exports.getOtherDebtor = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const row = await OtherDebtor.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Other Debtor not found.' });
        const debtor = await Debtor.findOne({ where: { companyId, debtorType: 'other', sourceId: row.id } });
        const canModify = await canModifyRecord(req, row);
        res.status(200).json({ otherDebtor: { ...row.toJSON(), debtorId: debtor ? debtor.id : null, canModify } });
    } catch (error) {
        console.error('Error loading other debtor:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/ar/other-debtors - create the party + open its ledger account in
// one transaction. Code comes from Numbering Control (purpose
// 'ar-other-debtor', gapless in-tx issue) or is keyed in (manual / no scheme).
// Optional { terms, creditLimit, sendReminders, chargeInterest } seed the
// ledger account.
exports.createOtherDebtor = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const parsed = normalizeProfile(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });

        let code = strOrNull(req.body.code);
        const mode = await numberingGateway.getMode(req, OTHER_DEBTOR_NUMBERING_PURPOSE);
        if (mode !== 'auto') {
            if (!code) return res.status(400).json({ message: 'Debtor code is required (no auto-numbering scheme is active).' });
            const clash = await OtherDebtor.findOne({ where: { companyId, code }, attributes: ['id'] });
            if (clash) return res.status(409).json({ message: `Debtor code '${code}' is already in use.` });
        }

        const terms = req.body.terms === null || req.body.terms === undefined || req.body.terms === ''
            ? null : Number(req.body.terms);
        if (terms !== null && (!Number.isInteger(terms) || terms < 0 || terms > 3650)) {
            return res.status(400).json({ message: 'Terms must be a number of days (0-3650).' });
        }
        const creditLimit = Number(req.body.creditLimit);
        if (('creditLimit' in req.body) && (!Number.isFinite(creditLimit) || creditLimit < 0)) {
            return res.status(400).json({ message: 'Credit limit must be zero or a positive amount.' });
        }

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);

        let created;
        try {
            created = await sequelize.transaction(async (t) => {
                if (mode === 'auto') {
                    const issued = await numberingGateway.issueNumber(req, OTHER_DEBTOR_NUMBERING_PURPOSE, { transaction: t });
                    if (issued && issued.number) code = issued.number;
                    if (!code) throw httpError(400, 'Debtor code is required (no auto-numbering scheme is active).');
                    const clash = await OtherDebtor.findOne({ where: { companyId, code }, attributes: ['id'], transaction: t });
                    if (clash) throw httpError(409, `Debtor code '${code}' is already in use.`);
                }

                const row = await OtherDebtor.create({ companyId, code, ...parsed.value, ...stamps }, { transaction: t });
                // Same-tx ledger account (in-process is fine INSIDE the ar module;
                // the outbox path is for cross-service producers).
                const debtor = await provisionDebtor({
                    companyId,
                    debtorType: 'other',
                    sourceId: row.id,
                    terms,
                    creditLimit: Number.isFinite(creditLimit) ? creditLimit : 0,
                    sendReminders: !!req.body.sendReminders,
                    chargeInterest: !!req.body.chargeInterest,
                }, t);
                // Staff-created ledger rows carry the caller's stamps (unlike
                // system-provisioned membership debtors).
                await debtor.update({ ...stamps }, { transaction: t });
                return row;
            });
        } catch (err) {
            if (err && err.httpStatus) return res.status(err.httpStatus).json({ message: err.message });
            throw err;
        }

        res.status(201).json({ message: `Other Debtor ${code} created.`, otherDebtor: created });
    } catch (error) {
        console.error('Error creating other debtor:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/ar/other-debtors/:id - edit the party profile, or enable/disable.
// Disabling suspends the ledger account (blocks new postings); enabling
// re-activates it. Code is immutable.
exports.updateOtherDebtor = async (req, res) => {
    try {
        const { companyId, userId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const row = await OtherDebtor.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Other Debtor not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        const parsed = normalizeProfile({ ...row.toJSON(), ...req.body });
        if (parsed.error) return res.status(400).json({ message: parsed.error });

        const toggling = 'isActive' in req.body && !!req.body.isActive !== row.isActive;

        await sequelize.transaction(async (t) => {
            Object.assign(row, parsed.value);
            if ('isActive' in req.body) row.isActive = !!req.body.isActive;
            row.updatedBy = userId;
            await row.save({ transaction: t });

            if (toggling) {
                const debtor = await Debtor.findOne({
                    where: { companyId, debtorType: 'other', sourceId: row.id }, transaction: t,
                });
                // Closed accounts stay closed - disable/enable only swaps
                // active <-> suspended.
                if (debtor && debtor.status !== 'closed') {
                    debtor.status = row.isActive ? 'active' : 'suspended';
                    debtor.updatedBy = userId;
                    await debtor.save({ transaction: t });
                }
            }
        });

        res.status(200).json({ message: `Other Debtor ${row.code} updated.`, otherDebtor: row });
    } catch (error) {
        console.error('Error updating other debtor:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
