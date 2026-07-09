const { sequelize } = require('../../platform/db');
const { getActiveAccountId } = require('../../platform/serviceContext');
const TaxScheme = require('./taxScheme.model');
const TaxRate = require('./taxRate.model');
const TaxSchemeTemplate = require('./taxSchemeTemplate.model');
const TaxRateTemplate = require('./taxRateTemplate.model');
const {
    IE_FLAGS,
    TAX_CLASSES,
    IE_FLAG_KEYS,
    TAX_CLASS_KEYS,
} = require('./tax.constants');

// The Tax scheme catalog is SUBSCRIBER-owned (keyed by accountId), so every request
// resolves the caller's account from their active workspace via the serviceContext
// seam - the tax module never queries Company directly.

// YYYY-MM-DD (a plain calendar date, no time component).
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function str(v) {
    return typeof v === 'string' ? v.trim() : '';
}

// Validate + normalise one rate-line payload. Returns { value } or { error }.
function parseRate(body) {
    const taxCode = str(body.taxCode);
    if (!taxCode) return { error: 'Tax code is required for each rate line.' };

    const taxRate = Number(body.taxRate);
    if (!Number.isFinite(taxRate) || taxRate < 0) return { error: 'Tax rate must be a non-negative number.' };

    const effectiveFrom = str(body.effectiveFrom);
    if (!ISO_DATE.test(effectiveFrom)) return { error: 'Effective-from date must be a valid date (YYYY-MM-DD).' };

    let taxPriority = body.taxPriority === undefined || body.taxPriority === null ? 1 : Number(body.taxPriority);
    if (!Number.isInteger(taxPriority) || taxPriority < 1 || taxPriority > 5) {
        return { error: 'Tax priority must be a whole number from 1 to 5.' };
    }

    const isClaimable = !!body.isClaimable;
    let claimPercentage = body.claimPercentage === undefined || body.claimPercentage === null ? 0 : Number(body.claimPercentage);
    if (!Number.isFinite(claimPercentage) || claimPercentage < 0 || claimPercentage > 100) {
        return { error: 'Claim percentage must be between 0 and 100.' };
    }
    if (!isClaimable) claimPercentage = 0; // meaningless unless claimable

    const glAccountCode = str(body.glAccountCode) || null;

    return { value: { taxCode, taxRate, taxPriority, isClaimable, claimPercentage, glAccountCode, effectiveFrom } };
}

// Shape a scheme (optionally with its rate lines) for the API response.
function toSchemeDto(scheme) {
    const rates = scheme.Rates
        ? [...scheme.Rates].sort((a, b) => a.taxCode.localeCompare(b.taxCode) || String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)))
        : undefined;
    return {
        id: scheme.id,
        countryCode: scheme.countryCode,
        taxSchemeCode: scheme.taxSchemeCode,
        name: scheme.name,
        description: scheme.description,
        ieFlag: scheme.ieFlag,
        taxClass: scheme.taxClass,
        sourceTemplateId: scheme.sourceTemplateId,
        isActive: scheme.isActive,
        rates: rates && rates.map((r) => ({
            id: r.id,
            taxCode: r.taxCode,
            taxRate: Number(r.taxRate),
            taxPriority: r.taxPriority,
            isClaimable: r.isClaimable,
            claimPercentage: Number(r.claimPercentage),
            glAccountCode: r.glAccountCode,
            effectiveFrom: r.effectiveFrom,
            isActive: r.isActive,
        })),
    };
}

// GET /api/tax/meta - the fixed option lists for the screen's dropdowns (and what
// the API validates against). No account needed.
exports.getMeta = async (req, res) => {
    res.status(200).json({
        ieFlags: Object.values(IE_FLAGS).map((v) => ({ key: v, label: v })),
        taxClasses: Object.values(TAX_CLASSES).map((v) => ({ key: v, label: v })),
    });
};

// GET /api/tax/schemes[?countryCode=XX] - the subscriber's schemes with rate lines.
exports.listSchemes = async (req, res) => {
    try {
        const accountId = await getActiveAccountId(req);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const where = { accountId };
        const countryCode = str(req.query.countryCode);
        if (countryCode) where.countryCode = countryCode;

        const rows = await TaxScheme.findAll({
            where,
            include: [{ model: TaxRate, as: 'Rates' }],
            order: [['countryCode', 'ASC'], ['taxSchemeCode', 'ASC']],
        });
        res.status(200).json(rows.map(toSchemeDto));
    } catch (error) {
        console.error('Error listing tax schemes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/tax/schemes
// Body: { countryCode, taxSchemeCode, name, description?, ieFlag, taxClass, isActive?, rates?: [...] }
// Creates the header and any supplied rate lines atomically.
exports.createScheme = async (req, res) => {
    try {
        const accountId = await getActiveAccountId(req);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const countryCode = str(req.body.countryCode);
        const taxSchemeCode = str(req.body.taxSchemeCode);
        const name = str(req.body.name);
        const ieFlag = str(req.body.ieFlag);
        const taxClass = str(req.body.taxClass);
        const description = typeof req.body.description === 'string' ? req.body.description.trim() || null : null;

        if (!countryCode) return res.status(400).json({ message: 'Country is required.' });
        if (!taxSchemeCode) return res.status(400).json({ message: 'Tax scheme code is required.' });
        if (!name) return res.status(400).json({ message: 'Name is required.' });
        if (!IE_FLAG_KEYS.includes(ieFlag)) return res.status(400).json({ message: 'Invalid inclusive/exclusive flag.' });
        if (!TAX_CLASS_KEYS.includes(taxClass)) return res.status(400).json({ message: 'Invalid tax class.' });

        // Validate rate lines up front (all-or-nothing).
        const rawRates = Array.isArray(req.body.rates) ? req.body.rates : [];
        const parsedRates = [];
        for (const r of rawRates) {
            const parsed = parseRate(r);
            if (parsed.error) return res.status(400).json({ message: parsed.error });
            parsedRates.push(parsed.value);
        }
        const dupeKey = new Set();
        for (const r of parsedRates) {
            const k = `${r.taxCode}|${r.effectiveFrom}`;
            if (dupeKey.has(k)) return res.status(400).json({ message: `Duplicate rate line for '${r.taxCode}' on ${r.effectiveFrom}.` });
            dupeKey.add(k);
        }

        const existing = await TaxScheme.findOne({ where: { accountId, countryCode, taxSchemeCode } });
        if (existing) return res.status(409).json({ message: `Tax scheme '${taxSchemeCode}' already exists for ${countryCode}.` });

        const scheme = await sequelize.transaction(async (t) => {
            const created = await TaxScheme.create({
                accountId,
                countryCode,
                taxSchemeCode,
                name,
                description,
                ieFlag,
                taxClass,
                isActive: typeof req.body.isActive === 'boolean' ? req.body.isActive : true,
            }, { transaction: t });

            if (parsedRates.length) {
                await TaxRate.bulkCreate(
                    parsedRates.map((r) => ({ ...r, taxSchemeId: created.id })),
                    { transaction: t },
                );
            }
            return created;
        });

        const full = await TaxScheme.findByPk(scheme.id, { include: [{ model: TaxRate, as: 'Rates' }] });
        res.status(201).json({ message: 'Tax scheme created.', scheme: toSchemeDto(full) });
    } catch (error) {
        console.error('Error creating tax scheme:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/tax/schemes/:id - header fields only (rate lines have their own routes).
// Body: any of { taxSchemeCode, name, description, ieFlag, taxClass, isActive }
exports.updateScheme = async (req, res) => {
    try {
        const accountId = await getActiveAccountId(req);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const scheme = await TaxScheme.findOne({ where: { id: req.params.id, accountId } });
        if (!scheme) return res.status(404).json({ message: 'Tax scheme not found.' });

        if (typeof req.body.taxSchemeCode === 'string' && req.body.taxSchemeCode.trim()) {
            const taxSchemeCode = req.body.taxSchemeCode.trim();
            if (taxSchemeCode !== scheme.taxSchemeCode) {
                const clash = await TaxScheme.findOne({ where: { accountId, countryCode: scheme.countryCode, taxSchemeCode } });
                if (clash) return res.status(409).json({ message: `Tax scheme '${taxSchemeCode}' already exists for ${scheme.countryCode}.` });
                scheme.taxSchemeCode = taxSchemeCode;
            }
        }
        if (typeof req.body.name === 'string' && req.body.name.trim()) scheme.name = req.body.name.trim();
        if (typeof req.body.description === 'string') scheme.description = req.body.description.trim() || null;
        if (typeof req.body.ieFlag === 'string' && req.body.ieFlag.trim()) {
            const ieFlag = req.body.ieFlag.trim();
            if (!IE_FLAG_KEYS.includes(ieFlag)) return res.status(400).json({ message: 'Invalid inclusive/exclusive flag.' });
            scheme.ieFlag = ieFlag;
        }
        if (typeof req.body.taxClass === 'string' && req.body.taxClass.trim()) {
            const taxClass = req.body.taxClass.trim();
            if (!TAX_CLASS_KEYS.includes(taxClass)) return res.status(400).json({ message: 'Invalid tax class.' });
            scheme.taxClass = taxClass;
        }
        if (typeof req.body.isActive === 'boolean') scheme.isActive = req.body.isActive;

        await scheme.save();
        const full = await TaxScheme.findByPk(scheme.id, { include: [{ model: TaxRate, as: 'Rates' }] });
        res.status(200).json({ message: 'Tax scheme updated.', scheme: toSchemeDto(full) });
    } catch (error) {
        console.error('Error updating tax scheme:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Confirm a rate line belongs to a scheme the caller's account owns.
async function findOwnedRate(accountId, rateId) {
    const rate = await TaxRate.findByPk(rateId, { include: [{ model: TaxScheme, as: 'Scheme', attributes: ['id', 'accountId'] }] });
    if (!rate || !rate.Scheme || rate.Scheme.accountId !== accountId) return null;
    return rate;
}

// POST /api/tax/schemes/:id/rates - add a rate line to a scheme.
// A rate CHANGE is a new line with a later effectiveFrom, not an edit of an old one.
exports.addRate = async (req, res) => {
    try {
        const accountId = await getActiveAccountId(req);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const scheme = await TaxScheme.findOne({ where: { id: req.params.id, accountId } });
        if (!scheme) return res.status(404).json({ message: 'Tax scheme not found.' });

        const parsed = parseRate(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });

        const clash = await TaxRate.findOne({ where: { taxSchemeId: scheme.id, taxCode: parsed.value.taxCode, effectiveFrom: parsed.value.effectiveFrom } });
        if (clash) return res.status(409).json({ message: `A '${parsed.value.taxCode}' rate effective ${parsed.value.effectiveFrom} already exists.` });

        const rate = await TaxRate.create({ ...parsed.value, taxSchemeId: scheme.id });
        res.status(201).json({ message: 'Rate line added.', rateId: rate.id });
    } catch (error) {
        console.error('Error adding tax rate:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/tax/rates/:id - correct a rate line's fields, or toggle isActive.
// (Correcting a mis-keyed value; a genuine future rate change should be a new line.)
exports.updateRate = async (req, res) => {
    try {
        const accountId = await getActiveAccountId(req);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const rate = await findOwnedRate(accountId, req.params.id);
        if (!rate) return res.status(404).json({ message: 'Rate line not found.' });

        // Re-validate only the fields that change, reusing the parser on a merged view.
        const merged = {
            taxCode: req.body.taxCode !== undefined ? req.body.taxCode : rate.taxCode,
            taxRate: req.body.taxRate !== undefined ? req.body.taxRate : rate.taxRate,
            effectiveFrom: req.body.effectiveFrom !== undefined ? req.body.effectiveFrom : rate.effectiveFrom,
            taxPriority: req.body.taxPriority !== undefined ? req.body.taxPriority : rate.taxPriority,
            isClaimable: req.body.isClaimable !== undefined ? req.body.isClaimable : rate.isClaimable,
            claimPercentage: req.body.claimPercentage !== undefined ? req.body.claimPercentage : rate.claimPercentage,
            glAccountCode: req.body.glAccountCode !== undefined ? req.body.glAccountCode : rate.glAccountCode,
        };
        const parsed = parseRate(merged);
        if (parsed.error) return res.status(400).json({ message: parsed.error });

        // Guard the (code, effectiveFrom) uniqueness when either changes.
        if (parsed.value.taxCode !== rate.taxCode || parsed.value.effectiveFrom !== String(rate.effectiveFrom)) {
            const clash = await TaxRate.findOne({
                where: { taxSchemeId: rate.taxSchemeId, taxCode: parsed.value.taxCode, effectiveFrom: parsed.value.effectiveFrom },
            });
            if (clash && clash.id !== rate.id) {
                return res.status(409).json({ message: `A '${parsed.value.taxCode}' rate effective ${parsed.value.effectiveFrom} already exists.` });
            }
        }

        Object.assign(rate, parsed.value);
        if (typeof req.body.isActive === 'boolean') rate.isActive = req.body.isActive;
        await rate.save();
        res.status(200).json({ message: 'Rate line updated.' });
    } catch (error) {
        console.error('Error updating tax rate:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/tax/load-defaults   Body: { countryCode }
// Copy the platform's active tax-scheme templates for a country into the subscriber's
// own catalog (copy-on-adopt). Each new scheme records its `sourceTemplateId` for
// provenance; from then on the subscriber owns it (no runtime link to the template).
// Templates carry no effective date (they are a point-in-time snapshot), so copied
// rate lines take the template's `seededAsOf` as their effectiveFrom (today if unset).
// Idempotent per code: a scheme code the subscriber already has is skipped, not
// duplicated or overwritten - so re-running only adds what is missing.
exports.loadDefaults = async (req, res) => {
    try {
        const accountId = await getActiveAccountId(req);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const countryCode = str(req.body.countryCode).toLowerCase();
        if (!countryCode) return res.status(400).json({ message: 'Country is required.' });

        const templates = await TaxSchemeTemplate.findAll({
            where: { countryCode, isActive: true },
            include: [{ model: TaxRateTemplate, as: 'Rates' }],
            order: [['taxSchemeCode', 'ASC']],
        });
        if (templates.length === 0) {
            return res.status(200).json({ created: 0, skipped: 0, message: `No platform tax defaults are available for ${countryCode.toUpperCase()}.` });
        }

        const existing = await TaxScheme.findAll({ where: { accountId, countryCode }, attributes: ['taxSchemeCode'] });
        const existingCodes = new Set(existing.map((s) => s.taxSchemeCode));
        const fallbackDate = new Date().toISOString().slice(0, 10);

        let created = 0;
        let skipped = 0;
        await sequelize.transaction(async (t) => {
            for (const tmpl of templates) {
                if (existingCodes.has(tmpl.taxSchemeCode)) {
                    skipped += 1;
                    continue;
                }
                const scheme = await TaxScheme.create({
                    accountId,
                    countryCode,
                    taxSchemeCode: tmpl.taxSchemeCode,
                    name: tmpl.name,
                    description: tmpl.description,
                    ieFlag: tmpl.ieFlag,
                    taxClass: tmpl.taxClass,
                    sourceTemplateId: tmpl.id,
                    isActive: true,
                }, { transaction: t });

                const effectiveFrom = tmpl.seededAsOf || fallbackDate;
                if (tmpl.Rates && tmpl.Rates.length) {
                    await TaxRate.bulkCreate(
                        tmpl.Rates.map((r) => ({
                            taxSchemeId: scheme.id,
                            taxCode: r.taxCode,
                            taxRate: r.taxRate,
                            taxPriority: r.taxPriority,
                            isClaimable: r.isClaimable,
                            claimPercentage: r.claimPercentage,
                            glAccountCode: r.glAccountCode,
                            effectiveFrom,
                            isActive: true,
                        })),
                        { transaction: t },
                    );
                }
                created += 1;
            }
        });

        const parts = [`Loaded ${created} scheme${created === 1 ? '' : 's'} for ${countryCode.toUpperCase()}`];
        if (skipped) parts.push(`${skipped} already existed`);
        res.status(200).json({ created, skipped, message: `${parts.join('; ')}.` });
    } catch (error) {
        console.error('Error loading tax defaults:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/tax/rates/:id - remove a rate line (before it is used on documents).
exports.deleteRate = async (req, res) => {
    try {
        const accountId = await getActiveAccountId(req);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const rate = await findOwnedRate(accountId, req.params.id);
        if (!rate) return res.status(404).json({ message: 'Rate line not found.' });

        await rate.destroy();
        res.status(200).json({ message: 'Rate line removed.' });
    } catch (error) {
        console.error('Error deleting tax rate:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
