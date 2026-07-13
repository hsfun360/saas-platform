const { sequelize } = require('../../platform/db');
const MembershipType = require('./membershipType.model');
const MembershipTypeFee = require('./membershipTypeFee.model');
const MembershipStatus = require('./membershipStatus.model');
const MembershipFee = require('./membershipFee.model');
const { getUserContext, listAccountCurrencies } = require('../../platform/serviceContext');
const { MEMBERSHIP_CLASSES, MEMBERSHIP_CLASS_KEYS } = require('./membershipType.constants');

const FEES_INCLUDE = [{ model: MembershipTypeFee, as: 'AdditionalFees' }];

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

function toFeeLineDto(f) {
    return {
        id: f.id,
        transactionType: f.transactionType,
        description: f.description,
        taxSchemeCode: f.taxSchemeCode,
        currencyCode: f.currencyCode,
        amount: Number(f.amount),
    };
}

function toTypeDto(t) {
    return {
        additionalFees: (t.AdditionalFees || [])
            .slice()
            .sort((a, b) => a.transactionType.localeCompare(b.transactionType))
            .map(toFeeLineDto),
        id: t.id,
        companyId: t.companyId,
        category: t.category,
        description: t.description,
        membershipClass: t.membershipClass,
        golfingAllow: t.golfingAllow,
        dependentGolfingAllow: t.dependentGolfingAllow,
        votingRight: t.votingRight,
        transferRight: t.transferRight,
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
            taxSchemeCode: str(f.taxSchemeCode) || null,
            currencyCode,
            amount: Math.round((amount + Number.EPSILON) * 100) / 100,
        });
    }
    return { value: lines };
}

// Pure validation + normalisation of a type payload (class-conditional fields are
// nulled for the other class). Returns { value } or { error }.
function normalizeTypeBody(body) {
    const category = str(body.category);
    if (!category) return { error: 'Category is required.' };

    const description = typeof body.description === 'string' ? body.description.trim() || null : null;
    const membershipClass = str(body.membershipClass);
    if (!MEMBERSHIP_CLASS_KEYS.includes(membershipClass)) return { error: 'Invalid membership class.' };

    const golfingAllow = !!body.golfingAllow;
    const dependentGolfingAllow = !!body.dependentGolfingAllow;
    const votingRight = !!body.votingRight;
    const transferRight = !!body.transferRight;

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
    if (membershipClass === 'personal') {
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

    return {
        value: {
            category, description, membershipClass,
            golfingAllow, dependentGolfingAllow, votingRight, transferRight,
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
    res.status(200).json({ classes: MEMBERSHIP_CLASSES });
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

// GET /api/membership/types - every type for the active company.
exports.listTypes = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const rows = await MembershipType.findAll({ where: { companyId }, include: FEES_INCLUDE, order: [['category', 'ASC']] });
        res.status(200).json(rows.map(toTypeDto));
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

        const parsedFees = normalizeFeeLines(req.body);
        if (parsedFees.error) return res.status(400).json({ message: parsedFees.error });

        const refErr = await validateRefs(companyId, v, null);
        if (refErr) return res.status(400).json({ message: refErr });

        const existing = await MembershipType.findOne({ where: { companyId, category: v.category } });
        if (existing) return res.status(409).json({ message: `Membership type '${v.category}' already exists.` });

        const type = await sequelize.transaction(async (t) => {
            const created = await MembershipType.create({ companyId, ...v }, { transaction: t });
            if (parsedFees.value.length) {
                await MembershipTypeFee.bulkCreate(
                    parsedFees.value.map((f) => ({ ...f, membershipTypeId: created.id })),
                    { transaction: t },
                );
            }
            return created;
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

        const parsed = normalizeTypeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        const parsedFees = normalizeFeeLines(req.body);
        if (parsedFees.error) return res.status(400).json({ message: parsedFees.error });

        const refErr = await validateRefs(companyId, v, type.id);
        if (refErr) return res.status(400).json({ message: refErr });

        if (v.category !== type.category) {
            const clash = await MembershipType.findOne({ where: { companyId, category: v.category } });
            if (clash) return res.status(409).json({ message: `Membership type '${v.category}' already exists.` });
        }

        await sequelize.transaction(async (t) => {
            Object.assign(type, v);
            await type.save({ transaction: t });

            // Replace the additional-fee lines wholesale (setup data - no posted
            // state to preserve, unlike MembershipFeeScheme stages).
            await MembershipTypeFee.destroy({ where: { membershipTypeId: type.id }, transaction: t });
            if (parsedFees.value.length) {
                await MembershipTypeFee.bulkCreate(
                    parsedFees.value.map((f) => ({ ...f, membershipTypeId: type.id })),
                    { transaction: t },
                );
            }
        });

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

        if (typeof req.body.isActive === 'boolean') {
            type.isActive = req.body.isActive;
            await type.save();
        }
        const full = await MembershipType.findByPk(type.id, { include: FEES_INCLUDE });
        res.status(200).json({ message: 'Membership type updated.', type: toTypeDto(full) });
    } catch (error) {
        console.error('Error updating membership type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
