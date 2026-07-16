const { sequelize } = require('../../platform/db');
const MembershipType = require('./membershipType.model');
const MembershipTypeFee = require('./membershipTypeFee.model');
const MembershipTypeStandingCharge = require('./membershipTypeStandingCharge.model');
const MembershipStatus = require('./membershipStatus.model');
const MembershipFee = require('./membershipFee.model');
const TransactionType = require('./transactionType.model');
const {
    getUserContext,
    listAccountCurrencies,
    getCallerPlacement,
    canModifyRecord,
    annotateCanModify,
} = require('../../platform/serviceContext');
const {
    MEMBERSHIP_CLASSES,
    MEMBERSHIP_CLASS_KEYS,
    STANDING_FREQUENCIES,
    STANDING_FREQUENCY_KEYS,
} = require('./membershipType.constants');

const FEES_INCLUDE = [
    { model: MembershipTypeFee, as: 'AdditionalFees' },
    { model: MembershipTypeStandingCharge, as: 'StandingCharges' },
];

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

function str(v) {
    return typeof v === 'string' ? v.trim() : '';
}

// Empty / null -> null, else a Number. Used for the optional integer/decimal fields.
function numOrNull(v) {
    if (v === '' || v === null || v === undefined) return null;
    return Number(v);
}

// Tax is single-sourced from the Transaction Type master (2026-07-16) - the
// fee/charge rows no longer carry their own taxSchemeCode.
function toFeeLineDto(f) {
    return {
        id: f.id,
        transactionType: f.transactionType,
        description: f.description,
        currencyCode: f.currencyCode,
        amount: Number(f.amount),
    };
}

function toStandingChargeDto(c) {
    return {
        id: c.id,
        membershipStatusId: c.membershipStatusId,
        description: c.description,
        transactionType: c.transactionType,
        currencyCode: c.currencyCode,
        amount: Number(c.amount),
        frequency: c.frequency,
        fixedMonth: c.fixedMonth,
    };
}

// `canModify` (row-level data scope) is stamped by the list handler; detail
// responses after a successful create/update are by definition modifiable.
function toTypeDto(t, canModify = true) {
    return {
        canModify,
        additionalFees: (t.AdditionalFees || [])
            .slice()
            .sort((a, b) => a.transactionType.localeCompare(b.transactionType))
            .map(toFeeLineDto),
        standingCharges: (t.StandingCharges || []).map(toStandingChargeDto),
        id: t.id,
        companyId: t.companyId,
        category: t.category,
        description: t.description,
        membershipClass: t.membershipClass,
        isGolfAllow: t.isGolfAllow,
        dependentGolfingAllow: t.dependentGolfingAllow,
        votingRight: t.votingRight,
        transferRight: t.transferRight,
        isTermMembership: t.isTermMembership,
        termMonths: t.termMonths,
        conversionTargetIds: t.conversionTargetIds || [],
        childAgeFrom: t.childAgeFrom,
        childAgeTo: t.childAgeTo,
        playTimes: t.playTimes,
        noOfNominee: t.noOfNominee,
        nomineeCategoryId: t.nomineeCategoryId,
        defaultMembershipStatusId: t.defaultMembershipStatusId,
        defaultMembershipFeeId: t.defaultMembershipFeeId,
        arDebtorType: t.arDebtorType,
        creditLimit: t.creditLimit == null ? null : Number(t.creditLimit),
        isActive: t.isActive,
    };
}

// Validate + normalise the additional-fee lines. Returns { value } or { error }.
function normalizeFeeLines(body) {
    const raw = Array.isArray(body.additionalFees) ? body.additionalFees : [];
    const lines = [];
    for (const f of raw) {
        const transactionType = str(f.transactionType);
        if (!transactionType) return { error: 'Transaction type is required for each additional fee.' };

        const currencyCode = str(f.currencyCode).toUpperCase();
        if (!/^[A-Z]{3}$/.test(currencyCode)) return { error: 'Each additional fee needs a 3-letter currency code.' };

        const amount = Number(f.amount);
        if (!Number.isFinite(amount) || amount < 0) return { error: 'Each additional fee amount must be a non-negative number.' };

        lines.push({
            transactionType,
            description: typeof f.description === 'string' ? f.description.trim() || null : null,
            currencyCode,
            amount: Math.round((amount + Number.EPSILON) * 100) / 100,
        });
    }
    return { value: lines };
}

// Validate + normalise the standing-charge rows. Rows are added explicitly (like
// joining fees); a status may carry MULTIPLE charges (user rule 2026-07-16).
// Returns { value } or { error }. Status ownership is checked separately against
// the company's master.
function normalizeStandingCharges(body) {
    const raw = Array.isArray(body.standingCharges) ? body.standingCharges : [];
    const rows = [];
    for (const c of raw) {
        const membershipStatusId = str(c.membershipStatusId);
        if (!membershipStatusId) return { error: 'Each standing charge needs a membership status.' };

        const transactionType = str(c.transactionType);
        if (!transactionType) return { error: 'Transaction type is required for each standing charge.' };

        const currencyCode = str(c.currencyCode).toUpperCase();
        if (!/^[A-Z]{3}$/.test(currencyCode)) return { error: 'Each standing charge needs a 3-letter currency code.' };

        const amount = Number(c.amount);
        if (!Number.isFinite(amount) || amount < 0) return { error: 'Each standing charge amount must be a non-negative number.' };

        const frequency = str(c.frequency);
        if (!STANDING_FREQUENCY_KEYS.includes(frequency)) return { error: 'Invalid standing-charge frequency.' };

        let fixedMonth = null;
        if (frequency === 'fixed-month') {
            fixedMonth = Number(c.fixedMonth);
            if (!Number.isInteger(fixedMonth) || fixedMonth < 1 || fixedMonth > 12) {
                return { error: 'A "Fixed Month" charge needs a month between 1 and 12.' };
            }
        }

        rows.push({
            membershipStatusId,
            description: typeof c.description === 'string' ? c.description.trim() || null : null,
            transactionType,
            currencyCode,
            amount: Math.round((amount + Number.EPSILON) * 100) / 100,
            frequency,
            fixedMonth,
        });
    }
    return { value: rows };
}

// Every picked transaction type must exist in the company's Transaction Type
// master, be ACTIVE, and carry one of the charge types the consumer allows
// (Joining fees: everything EXCEPT membership-fee/absentee-fee; Standing
// charges: standing-charges only).
async function validateTransactionTypes(companyId, codes, allowedChargeTypes, consumerLabel) {
    const unique = [...new Set(codes)];
    if (!unique.length) return null;
    const found = await TransactionType.findAll({
        where: { companyId, transactionType: unique, isActive: true },
        attributes: ['transactionType', 'chargeType'],
    });
    const byCode = new Map(found.map((t) => [t.transactionType, t.chargeType]));
    for (const code of unique) {
        const chargeType = byCode.get(code);
        if (!chargeType) return `Transaction type '${code}' was not found (or is disabled) in the Transaction Type master.`;
        if (!allowedChargeTypes.includes(chargeType)) {
            return `Transaction type '${code}' has the wrong charge type for ${consumerLabel}.`;
        }
    }
    return null;
}

// Every standing-charge status must be one of the company's own statuses.
async function validateStandingChargeStatuses(companyId, rows) {
    if (!rows.length) return null;
    const ids = rows.map((r) => r.membershipStatusId);
    const found = await MembershipStatus.findAll({ where: { id: ids, companyId }, attributes: ['id'] });
    if (found.length !== ids.length) return 'One or more standing-charge statuses were not found.';
    return null;
}

// Pure validation + normalisation of a type payload (class-conditional fields are
// nulled for the other class). Returns { value } or { error }.
function normalizeTypeBody(body) {
    const category = str(body.category);
    if (!category) return { error: 'Category is required.' };

    const description = typeof body.description === 'string' ? body.description.trim() || null : null;
    const membershipClass = str(body.membershipClass);
    if (!MEMBERSHIP_CLASS_KEYS.includes(membershipClass)) return { error: 'Invalid membership class.' };

    const isGolfAllow = !!body.isGolfAllow;
    // Golf-only settings apply only when golfing access is granted.
    const dependentGolfingAllow = isGolfAllow && !!body.dependentGolfingAllow;
    const votingRight = !!body.votingRight;
    const transferRight = !!body.transferRight;

    // Term membership: a fixed period in months (18 = 1.5 years); lifetime when off.
    const isTermMembership = !!body.isTermMembership;
    let termMonths = numOrNull(body.termMonths);
    if (isTermMembership) {
        if (termMonths === null || !Number.isInteger(termMonths) || termMonths < 1) {
            return { error: 'A term membership needs its period in months (a whole number of at least 1).' };
        }
    } else {
        termMonths = null;
    }

    let childAgeFrom = numOrNull(body.childAgeFrom);
    let childAgeTo = numOrNull(body.childAgeTo);
    let playTimes = numOrNull(body.playTimes);
    let noOfNominee = numOrNull(body.noOfNominee);
    const creditLimit = numOrNull(body.creditLimit);

    for (const [label, val] of [['Child age from', childAgeFrom], ['Child age to', childAgeTo], ['Play times', playTimes], ['No. of nominee', noOfNominee]]) {
        if (val !== null && (!Number.isInteger(val) || val < 0)) return { error: `${label} must be a whole number of at least 0.` };
    }
    if (creditLimit !== null && (!Number.isFinite(creditLimit) || creditLimit < 0)) return { error: 'Credit limit must be a non-negative number.' };

    const defaultMembershipStatusId = str(body.defaultMembershipStatusId) || null;
    const defaultMembershipFeeId = str(body.defaultMembershipFeeId) || null;
    const arDebtorType = typeof body.arDebtorType === 'string' ? body.arDebtorType.trim() || null : null;
    let nomineeCategoryId = str(body.nomineeCategoryId) || null;

    // Dedupe conversion targets.
    let conversionTargetIds = Array.isArray(body.conversionTargetIds)
        ? [...new Set(body.conversionTargetIds.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()))]
        : [];

    // Class-conditional: keep only the fields that apply to this class.
    if (membershipClass === 'individual') {
        noOfNominee = null;
        nomineeCategoryId = null;
    } else {
        childAgeFrom = null;
        childAgeTo = null;
        playTimes = null;
    }

    if (childAgeFrom !== null && childAgeTo !== null && childAgeFrom > childAgeTo) {
        return { error: 'Child age "from" must not be greater than "to".' };
    }

    // Play times is a golf setting - meaningless without golfing access.
    if (!isGolfAllow) playTimes = null;

    return {
        value: {
            category, description, membershipClass,
            isGolfAllow, dependentGolfingAllow, votingRight, transferRight,
            isTermMembership, termMonths,
            conversionTargetIds,
            childAgeFrom, childAgeTo, playTimes,
            noOfNominee, nomineeCategoryId,
            defaultMembershipStatusId, defaultMembershipFeeId, arDebtorType, creditLimit,
        },
    };
}

// Validate the cross-references all belong to the caller's company. `selfId` is
// the row being edited (excluded from nominee/conversion targets). Returns an
// error string or null.
async function validateRefs(companyId, v, selfId) {
    if (v.defaultMembershipStatusId) {
        const s = await MembershipStatus.findOne({ where: { id: v.defaultMembershipStatusId, companyId }, attributes: ['id'] });
        if (!s) return 'Default membership status not found.';
    }
    if (v.defaultMembershipFeeId) {
        const f = await MembershipFee.findOne({ where: { id: v.defaultMembershipFeeId, companyId }, attributes: ['id'] });
        if (!f) return 'Default membership fee not found.';
    }
    if (v.nomineeCategoryId) {
        if (v.nomineeCategoryId === selfId) return 'A type cannot be its own nominee category.';
        const t = await MembershipType.findOne({ where: { id: v.nomineeCategoryId, companyId }, attributes: ['id'] });
        if (!t) return 'Nominee category not found.';
    }
    if (v.conversionTargetIds.length) {
        if (selfId && v.conversionTargetIds.includes(selfId)) return 'A type cannot convert to itself.';
        const found = await MembershipType.findAll({ where: { id: v.conversionTargetIds, companyId }, attributes: ['id'] });
        if (found.length !== v.conversionTargetIds.length) return 'One or more conversion targets were not found.';
    }
    return null;
}

// GET /api/membership/types/meta - the membership class options for the dropdown.
exports.getMeta = async (req, res) => {
    res.status(200).json({ classes: MEMBERSHIP_CLASSES, frequencies: STANDING_FREQUENCIES });
};

// GET /api/membership/types/currencies - the subscriber's currency set for the
// additional-fee money fields (via the Control-Plane seam).
exports.getCurrencies = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const currencies = await listAccountCurrencies(req);
        res.status(200).json(currencies);
    } catch (error) {
        console.error('Error listing currencies for membership types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/membership/types/transaction-types - the company's ACTIVE Transaction
// Type master rows for the Joining-fees / Standing-charges pickers (served here
// so the Types screen needs no grant on the Transaction Type menu). The client
// filters by chargeType per dialog; taxSchemeCode is shown read-only (tax is
// single-sourced from the transaction type).
exports.getTransactionTypes = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const rows = await TransactionType.findAll({
            where: { companyId, isActive: true },
            attributes: ['transactionType', 'chargeType', 'description', 'taxSchemeCode'],
            order: [['transactionType', 'ASC']],
        });
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error listing transaction types for membership types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/membership/types - every type for the active company.
exports.listTypes = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const rows = await MembershipType.findAll({ where: { companyId }, include: FEES_INCLUDE, order: [['category', 'ASC']] });
        // Row-level data scope: flag which rows the caller's role may modify.
        const flags = await annotateCanModify(req, rows);
        res.status(200).json(rows.map((r, i) => toTypeDto(r, flags[i])));
    } catch (error) {
        console.error('Error listing membership types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/membership/types
exports.createType = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const parsed = normalizeTypeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        const refErr = await validateRefs(companyId, v, null);
        if (refErr) return res.status(400).json({ message: refErr });

        const existing = await MembershipType.findOne({ where: { companyId, category: v.category } });
        if (existing) return res.status(409).json({ message: `Membership type '${v.category}' already exists.` });

        // Ownership stamps: creator + their department at creation (data scope).
        // Joining fees / standing charges are maintained through their own
        // endpoints (below), not on create.
        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const type = await MembershipType.create({
            companyId,
            ...v,
            createdBy: callerId,
            createdByDepartmentId: placement.departmentId,
            updatedBy: callerId,
        });

        const full = await MembershipType.findByPk(type.id, { include: FEES_INCLUDE });
        res.status(201).json({ message: 'Membership type created.', type: toTypeDto(full) });
    } catch (error) {
        console.error('Error creating membership type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/membership/types/:id - full update.
exports.updateType = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const type = await MembershipType.findOne({ where: { id: req.params.id, companyId } });
        if (!type) return res.status(404).json({ message: 'Membership type not found.' });

        // Row-level data scope: own / department (strictly senior) / all.
        if (!(await canModifyRecord(req, type))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        const parsed = normalizeTypeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        const refErr = await validateRefs(companyId, v, type.id);
        if (refErr) return res.status(400).json({ message: refErr });

        if (v.category !== type.category) {
            const clash = await MembershipType.findOne({ where: { companyId, category: v.category } });
            if (clash) return res.status(409).json({ message: `Membership type '${v.category}' already exists.` });
        }

        // Joining fees / standing charges are maintained through their own
        // endpoints (below); this update touches the type row only.
        Object.assign(type, v);
        type.updatedBy = getUserContext(req).userId;
        await type.save();

        const full = await MembershipType.findByPk(type.id, { include: FEES_INCLUDE });
        res.status(200).json({ message: 'Membership type updated.', type: toTypeDto(full) });
    } catch (error) {
        console.error('Error updating membership type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/membership/types/:id - toggle isActive only.
exports.setActive = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const type = await MembershipType.findOne({ where: { id: req.params.id, companyId } });
        if (!type) return res.status(404).json({ message: 'Membership type not found.' });

        // Row-level data scope: own / department (strictly senior) / all.
        if (!(await canModifyRecord(req, type))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        if (typeof req.body.isActive === 'boolean') {
            type.isActive = req.body.isActive;
            type.updatedBy = getUserContext(req).userId;
            await type.save();
        }
        const full = await MembershipType.findByPk(type.id, { include: FEES_INCLUDE });
        res.status(200).json({ message: 'Membership type updated.', type: toTypeDto(full) });
    } catch (error) {
        console.error('Error updating membership type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Loads the type for a child-collection update, enforcing company ownership and
// row-level data scope. Returns { type } or writes the error response.
async function loadTypeForChildUpdate(req, res) {
    const companyId = companyIdOf(req);
    if (!companyId) {
        res.status(400).json({ message: 'Select a workspace first.' });
        return null;
    }
    const type = await MembershipType.findOne({ where: { id: req.params.id, companyId } });
    if (!type) {
        res.status(404).json({ message: 'Membership type not found.' });
        return null;
    }
    if (!(await canModifyRecord(req, type))) {
        res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        return null;
    }
    return type;
}

// PUT /api/membership/types/:id/additional-fees - replace the type's JOINING
// FEES: the one-time charges billed when a new member joins under this type
// (processing fee, entrance fee, ...). Maintained from its own dialog on the
// listing, separate from the type form.
exports.updateAdditionalFees = async (req, res) => {
    try {
        const type = await loadTypeForChildUpdate(req, res);
        if (!type) return;

        const parsedFees = normalizeFeeLines(req.body);
        if (parsedFees.error) return res.status(400).json({ message: parsedFees.error });

        // Joining fees accept every charge type EXCEPT membership-fee and
        // absentee-fee (user rule, 2026-07-16 - those items are billed by the
        // Membership Fee master / absentee function, never on joining).
        const txErr = await validateTransactionTypes(
            type.companyId,
            parsedFees.value.map((f) => f.transactionType),
            ['standing-charges', 'membership-transfer', 'miscellaneous'],
            'a joining fee',
        );
        if (txErr) return res.status(400).json({ message: txErr });

        await sequelize.transaction(async (t) => {
            // Replace wholesale - pure setup data, nothing posted to preserve.
            await MembershipTypeFee.destroy({ where: { membershipTypeId: type.id }, transaction: t });
            if (parsedFees.value.length) {
                await MembershipTypeFee.bulkCreate(
                    parsedFees.value.map((f) => ({ ...f, membershipTypeId: type.id })),
                    { transaction: t },
                );
            }
            type.updatedBy = getUserContext(req).userId;
            await type.save({ transaction: t });
        });

        const full = await MembershipType.findByPk(type.id, { include: FEES_INCLUDE });
        res.status(200).json({ message: `Joining fees for '${type.category}' saved.`, type: toTypeDto(full) });
    } catch (error) {
        console.error('Error updating joining fees:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/membership/types/:id/standing-charges - replace the type's STANDING
// CHARGES: recurring charges raised per the member's status at billing time.
// Only statuses the club actually charges get a row (deceased/terminated/
// resigned etc. simply have none). Maintained from its own dialog on the listing.
exports.updateStandingCharges = async (req, res) => {
    try {
        const type = await loadTypeForChildUpdate(req, res);
        if (!type) return;

        const parsedCharges = normalizeStandingCharges(req.body);
        if (parsedCharges.error) return res.status(400).json({ message: parsedCharges.error });

        const chargeErr = await validateStandingChargeStatuses(type.companyId, parsedCharges.value);
        if (chargeErr) return res.status(400).json({ message: chargeErr });

        const txErr = await validateTransactionTypes(
            type.companyId,
            parsedCharges.value.map((c) => c.transactionType),
            ['standing-charges'],
            'a standing charge',
        );
        if (txErr) return res.status(400).json({ message: txErr });

        await sequelize.transaction(async (t) => {
            await MembershipTypeStandingCharge.destroy({ where: { membershipTypeId: type.id }, transaction: t });
            if (parsedCharges.value.length) {
                await MembershipTypeStandingCharge.bulkCreate(
                    parsedCharges.value.map((c) => ({ ...c, membershipTypeId: type.id })),
                    { transaction: t },
                );
            }
            type.updatedBy = getUserContext(req).userId;
            await type.save({ transaction: t });
        });

        const full = await MembershipType.findByPk(type.id, { include: FEES_INCLUDE });
        res.status(200).json({ message: `Standing charges for '${type.category}' saved.`, type: toTypeDto(full) });
    } catch (error) {
        console.error('Error updating standing charges:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
