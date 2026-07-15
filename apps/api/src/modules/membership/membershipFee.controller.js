const { sequelize } = require('../../platform/db');
const MembershipFee = require('./membershipFee.model');
const MembershipFeeScheme = require('./membershipFeeScheme.model');
const {
    getUserContext,
    getCallerPlacement,
    canModifyRecord,
    annotateCanModify,
} = require('../../platform/serviceContext');
const { listCompanyTaxSchemes } = require('../../platform/taxGateway');
const { INSTALLMENT_INTERVALS, INSTALLMENT_INTERVAL_KEYS } = require('./membershipFee.constants');

function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

// Shape a fee (with its stages) for the API response. DECIMALs come back as
// strings from Sequelize, so coerce amounts to numbers.
// `canModify` (row-level data scope) is stamped by the list handler; detail
// responses after a successful create/update are by definition modifiable.
function toFeeDto(fee, canModify = true) {
    const stages = fee.Stages ? [...fee.Stages].sort((a, b) => a.stageNo - b.stageNo) : [];
    return {
        canModify,
        id: fee.id,
        companyId: fee.companyId,
        membershipFeeCode: fee.membershipFeeCode,
        description: fee.description,
        taxSchemeCode: fee.taxSchemeCode,
        amount: Number(fee.amount),
        allowInstallment: fee.allowInstallment,
        noOfInstallment: fee.noOfInstallment,
        installmentInterval: fee.installmentInterval,
        isActive: fee.isActive,
        stages: stages.map((s) => ({ id: s.id, stageNo: s.stageNo, amount: Number(s.amount), isPosted: s.isPosted })),
    };
}

// Validate + normalise a full fee payload (create / update). Returns { value } or
// { error }. When installments are allowed, the stage rows must total the amount.
function validateFeePayload(body) {
    const membershipFeeCode = String(body.membershipFeeCode || '').trim();
    if (!membershipFeeCode) return { error: 'Membership fee code is required.' };

    const description = typeof body.description === 'string' ? body.description.trim() || null : null;
    const taxSchemeCode = typeof body.taxSchemeCode === 'string' && body.taxSchemeCode.trim() ? body.taxSchemeCode.trim() : null;

    const amountNum = Number(body.amount);
    if (!Number.isFinite(amountNum) || amountNum < 0) return { error: 'Amount must be a non-negative number.' };
    const amount = round2(amountNum);

    const allowInstallment = !!body.allowInstallment;
    let noOfInstallment = null;
    let installmentInterval = null;
    let stages = [];

    if (allowInstallment) {
        noOfInstallment = Number(body.noOfInstallment);
        if (!Number.isInteger(noOfInstallment) || noOfInstallment < 1 || noOfInstallment > 120) {
            return { error: 'Number of installments must be a whole number between 1 and 120.' };
        }
        installmentInterval = String(body.installmentInterval || '').trim();
        if (!INSTALLMENT_INTERVAL_KEYS.includes(installmentInterval)) return { error: 'Invalid installment interval.' };

        const rawStages = Array.isArray(body.stages) ? body.stages : [];
        if (rawStages.length !== noOfInstallment) {
            return { error: `Provide exactly ${noOfInstallment} installment stage(s).` };
        }
        const seen = new Set();
        let sum = 0;
        for (const s of rawStages) {
            const stageNo = Number(s.stageNo);
            if (!Number.isInteger(stageNo) || stageNo < 1 || stageNo > noOfInstallment) return { error: 'Invalid stage number.' };
            if (seen.has(stageNo)) return { error: `Duplicate stage number ${stageNo}.` };
            seen.add(stageNo);
            const stageAmount = Number(s.amount);
            if (!Number.isFinite(stageAmount) || stageAmount < 0) return { error: 'Each stage amount must be a non-negative number.' };
            const rounded = round2(stageAmount);
            sum += rounded;
            stages.push({ stageNo, amount: rounded });
        }
        if (round2(sum) !== amount) {
            return { error: `Installment stages must total the fee amount (${amount.toFixed(2)}), but they total ${round2(sum).toFixed(2)}.` };
        }
        stages.sort((a, b) => a.stageNo - b.stageNo);
    }

    return { value: { membershipFeeCode, description, taxSchemeCode, amount, allowInstallment, noOfInstallment, installmentInterval, stages } };
}

// GET /api/membership/fees/meta - installment interval options for the dropdown.
exports.getMeta = async (req, res) => {
    res.status(200).json({ intervals: INSTALLMENT_INTERVALS });
};

// GET /api/membership/fees/tax-schemes - the active company's available tax
// schemes (via the tax seam), for the Tax Scheme picker. `countrySet` is false
// when the company has no country configured (so no schemes can resolve).
exports.getTaxSchemes = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const { scope, schemes } = await listCompanyTaxSchemes(req);
        // A membership fee is revenue charged to the member, so only OUTPUT
        // (sales / AR) tax applies - exclude INPUT (purchase / AP) schemes.
        const list = (schemes || [])
            .filter((r) => r.scheme.taxClass !== 'INPUT')
            .map((r) => ({ taxSchemeCode: r.scheme.taxSchemeCode, name: r.scheme.name }));
        res.status(200).json({ schemes: list, countrySet: !!scope });
    } catch (error) {
        console.error('Error listing tax schemes for fees:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/membership/fees - every fee for the active company, with its stages.
exports.listFees = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const fees = await MembershipFee.findAll({
            where: { companyId },
            include: [{ model: MembershipFeeScheme, as: 'Stages' }],
            order: [['membershipFeeCode', 'ASC']],
        });
        // Row-level data scope: flag which rows the caller's role may modify.
        const flags = await annotateCanModify(req, fees);
        res.status(200).json(fees.map((f, i) => toFeeDto(f, flags[i])));
    } catch (error) {
        console.error('Error listing membership fees:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/membership/fees - create a fee (+ its installment stages).
exports.createFee = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const parsed = validateFeePayload(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        const existing = await MembershipFee.findOne({ where: { companyId, membershipFeeCode: v.membershipFeeCode } });
        if (existing) return res.status(409).json({ message: `Membership fee '${v.membershipFeeCode}' already exists.` });

        // Ownership stamps: creator + their department at creation (data scope).
        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const fee = await sequelize.transaction(async (t) => {
            const created = await MembershipFee.create({
                companyId,
                membershipFeeCode: v.membershipFeeCode,
                description: v.description,
                taxSchemeCode: v.taxSchemeCode,
                amount: v.amount,
                allowInstallment: v.allowInstallment,
                noOfInstallment: v.noOfInstallment,
                installmentInterval: v.installmentInterval,
                createdBy: callerId,
                createdByDepartmentId: placement.departmentId,
                updatedBy: callerId,
            }, { transaction: t });

            if (v.stages.length) {
                await MembershipFeeScheme.bulkCreate(
                    v.stages.map((s) => ({ membershipFeeId: created.id, stageNo: s.stageNo, amount: s.amount, isPosted: false })),
                    { transaction: t },
                );
            }
            return created;
        });

        const full = await MembershipFee.findByPk(fee.id, { include: [{ model: MembershipFeeScheme, as: 'Stages' }] });
        res.status(201).json({ message: 'Membership fee created.', fee: toFeeDto(full) });
    } catch (error) {
        console.error('Error creating membership fee:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/membership/fees/:id - full update: header fields + replace the stages.
// isPosted is preserved per stage number across the rebuild.
exports.updateFee = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const fee = await MembershipFee.findOne({
            where: { id: req.params.id, companyId },
            include: [{ model: MembershipFeeScheme, as: 'Stages' }],
        });
        if (!fee) return res.status(404).json({ message: 'Membership fee not found.' });

        // Row-level data scope: own / department (strictly senior) / all.
        if (!(await canModifyRecord(req, fee))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        const parsed = validateFeePayload(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        if (v.membershipFeeCode !== fee.membershipFeeCode) {
            const clash = await MembershipFee.findOne({ where: { companyId, membershipFeeCode: v.membershipFeeCode } });
            if (clash) return res.status(409).json({ message: `Membership fee '${v.membershipFeeCode}' already exists.` });
        }

        // Preserve each stage's posted flag by stage number when rebuilding.
        const postedByStage = new Map((fee.Stages || []).map((s) => [s.stageNo, s.isPosted]));

        await sequelize.transaction(async (t) => {
            fee.membershipFeeCode = v.membershipFeeCode;
            fee.description = v.description;
            fee.taxSchemeCode = v.taxSchemeCode;
            fee.amount = v.amount;
            fee.allowInstallment = v.allowInstallment;
            fee.noOfInstallment = v.noOfInstallment;
            fee.installmentInterval = v.installmentInterval;
            fee.updatedBy = getUserContext(req).userId;
            await fee.save({ transaction: t });

            await MembershipFeeScheme.destroy({ where: { membershipFeeId: fee.id }, transaction: t });
            if (v.stages.length) {
                await MembershipFeeScheme.bulkCreate(
                    v.stages.map((s) => ({
                        membershipFeeId: fee.id,
                        stageNo: s.stageNo,
                        amount: s.amount,
                        isPosted: postedByStage.get(s.stageNo) || false,
                    })),
                    { transaction: t },
                );
            }
        });

        const full = await MembershipFee.findByPk(fee.id, { include: [{ model: MembershipFeeScheme, as: 'Stages' }] });
        res.status(200).json({ message: 'Membership fee updated.', fee: toFeeDto(full) });
    } catch (error) {
        console.error('Error updating membership fee:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/membership/fees/:id - toggle isActive only (quick enable/disable).
exports.setActive = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const fee = await MembershipFee.findOne({ where: { id: req.params.id, companyId } });
        if (!fee) return res.status(404).json({ message: 'Membership fee not found.' });

        // Row-level data scope: own / department (strictly senior) / all.
        if (!(await canModifyRecord(req, fee))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        if (typeof req.body.isActive === 'boolean') {
            fee.isActive = req.body.isActive;
            fee.updatedBy = getUserContext(req).userId;
            await fee.save();
        }
        const full = await MembershipFee.findByPk(fee.id, { include: [{ model: MembershipFeeScheme, as: 'Stages' }] });
        res.status(200).json({ message: 'Membership fee updated.', fee: toFeeDto(full) });
    } catch (error) {
        console.error('Error updating membership fee:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
