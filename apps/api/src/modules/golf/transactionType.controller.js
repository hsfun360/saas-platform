// Transaction Type master file (Golf Management → Master File Setup).
// The billing-item catalog: code + charge type + description + THE tax scheme
// (single source - consuming rows don't store their own tax). Mirrors the
// membership Transaction Type controller.

const { Storage } = require('@google-cloud/storage');
const { Op } = require('sequelize');
const GolfTransactionType = require('./transactionType.model');
const GolfTransactionTypeElement = require('./transactionTypeElement.model');
const GolfTransactionTypeEligibility = require('./transactionTypeEligibility.model');
const { DAY_KEYS } = require('./eligibility.service');
const { sequelize } = require('../../platform/db');
const {
    getUserContext,
    getCallerPlacement,
    canModifyRecord,
    annotateCanModify,
} = require('../../platform/serviceContext');
const { listCompanyTaxSchemes } = require('../../platform/taxGateway');
const {
    CHARGE_TYPES,
    CHARGE_TYPE_KEYS,
    MATRIX_CHARGE_TYPE_KEYS,
    PACKAGE_CHARGE_TYPE_KEY,
    GOLFER_TYPES,
    GOLFER_TYPE_KEYS,
    GOLFER_TYPED_CHARGE_TYPE_KEYS,
} = require('./transactionType.constants');

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

// Public image uploads go to the per-environment bucket named by ASSETS_BUCKET
// (12-factor: config from env, never hardcoded). Resolved lazily so a missing
// var fails the one upload request with a clear message, not the whole API.
const storage = new Storage(); // default credentials on Cloud Run
function assetsBucket() {
    const name = process.env.ASSETS_BUCKET;
    if (!name) throw new Error('ASSETS_BUCKET env var is not set - cannot store uploads.');
    return storage.bucket(name);
}

function str(v) {
    return typeof v === 'string' ? v.trim() : '';
}

function toDto(t, canModify = true) {
    const dto = {
        id: t.id,
        canModify,
        transactionType: t.transactionType,
        chargeType: t.chargeType,
        golferType: t.golferType,
        description: t.description,
        taxSchemeCode: t.taxSchemeCode,
        allowPriceOverride: t.allowPriceOverride === true,
        iconUrl: t.iconUrl,
        isActive: t.isActive,
    };
    if (t.chargeType === PACKAGE_CHARGE_TYPE_KEY) {
        dto.autoTransactionTypeId = t.autoTransactionTypeId;
        dto.packageItems = (t.Elements || [])
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((i) => ({
                id: i.id,
                elementTransactionTypeId: i.elementTransactionTypeId,
                quantity: i.quantity,
                unitAmount: Number(i.unitAmount),
                sortOrder: i.sortOrder,
            }));
        dto.eligibility = (t.Eligibility || [])
            .slice()
            .sort((a, b) => a.sequence - b.sequence)
            .map(eligibilityDto);
    }
    return dto;
}

function timeDto(v) {
    return v ? String(v).slice(0, 5) : null;
}

function eligibilityDto(r) {
    return {
        id: r.id,
        daysOfWeek: Array.isArray(r.daysOfWeek) ? r.daysOfWeek : null,
        excludePublicHolidays: r.excludePublicHolidays === true,
        startTime: timeDto(r.startTime),
        endTime: timeDto(r.endTime),
        holes: r.holes === null || r.holes === undefined ? null : Number(r.holes),
        minAge: r.minAge === null || r.minAge === undefined ? null : Number(r.minAge),
        maxAge: r.maxAge === null || r.maxAge === undefined ? null : Number(r.maxAge),
        gender: r.gender || null,
        nationalityCode: r.nationalityCode || null,
    };
}

const TIME_RE = /^(\d{2}):(\d{2})(?::\d{2})?$/;
function parseTime(v) {
    if (typeof v !== 'string') return undefined;
    const m = v.match(TIME_RE);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return undefined;
    return `${m[1]}:${m[2]}`;
}

function parseOptionalInt(v, min, max) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) return undefined;
    return n;
}

// Validate + normalise the ELIGIBILITY rows of a PACKAGE payload (OR-ed
// conditions; every column optional, an empty row is refused as meaningless).
// Returns { rows } or { error }.
function normalizeEligibility(body) {
    const raw = Array.isArray(body.eligibility) ? body.eligibility : [];
    if (raw.length > 20) return { error: 'A package can hold at most 20 eligibility conditions.' };
    const rows = [];
    for (let n = 0; n < raw.length; n += 1) {
        const line = raw[n] || {};
        const label = `Eligibility condition ${n + 1}`;
        let daysOfWeek = null;
        if (Array.isArray(line.daysOfWeek) && line.daysOfWeek.length) {
            daysOfWeek = [...new Set(line.daysOfWeek.map((d) => String(d)))];
            if (daysOfWeek.some((d) => !DAY_KEYS.includes(d))) return { error: `${label}: unknown day of week.` };
            if (daysOfWeek.length === 7) daysOfWeek = null; // every day = no day condition
        }
        const excludePublicHolidays = line.excludePublicHolidays === true;
        const hasStart = line.startTime !== null && line.startTime !== undefined && line.startTime !== '';
        const hasEnd = line.endTime !== null && line.endTime !== undefined && line.endTime !== '';
        if (hasStart !== hasEnd) return { error: `${label}: set both From and To times, or neither.` };
        let startTime = null;
        let endTime = null;
        if (hasStart) {
            startTime = parseTime(line.startTime);
            endTime = parseTime(line.endTime);
            if (!startTime || !endTime) return { error: `${label}: the times must be valid times of day.` };
            if (startTime >= endTime) return { error: `${label}: the From time must be before the To time.` };
        }
        const holes = parseOptionalInt(line.holes, 9, 18);
        if (holes === undefined || (holes !== null && holes !== 9 && holes !== 18)) return { error: `${label}: holes must be 9, 18 or Any.` };
        const minAge = parseOptionalInt(line.minAge, 0, 120);
        const maxAge = parseOptionalInt(line.maxAge, 0, 120);
        if (minAge === undefined || maxAge === undefined) return { error: `${label}: ages must be whole numbers between 0 and 120.` };
        if (minAge !== null && maxAge !== null && minAge > maxAge) return { error: `${label}: the minimum age is above the maximum age.` };
        const gender = line.gender ? String(line.gender) : null;
        if (gender && !['male', 'female'].includes(gender)) return { error: `${label}: gender must be Men, Ladies or Any.` };
        const nationalityCode = typeof line.nationalityCode === 'string' && line.nationalityCode.trim() ? line.nationalityCode.trim().toUpperCase().slice(0, 20) : null;
        if (!daysOfWeek && !excludePublicHolidays && !startTime && holes === null && minAge === null && maxAge === null && !gender && !nationalityCode) {
            return { error: `${label} sets no condition - remove it, or set at least one.` };
        }
        rows.push({ sequence: n + 1, daysOfWeek, excludePublicHolidays, startTime, endTime, holes, minAge, maxAge, gender, nationalityCode });
    }
    return { rows };
}

// Replace a package's eligibility rows atomically (inside the caller's txn).
async function writeEligibility(row, rows, callerId, departmentId, transaction) {
    await GolfTransactionTypeEligibility.destroy({ where: { transactionTypeId: row.id }, transaction });
    if (rows && rows.length) {
        await GolfTransactionTypeEligibility.bulkCreate(
            rows.map((r) => ({
                ...r,
                transactionTypeId: row.id,
                createdBy: callerId,
                createdByDepartmentId: departmentId,
                updatedBy: callerId,
            })),
            { transaction },
        );
    }
}

// Validate + normalise a payload. Returns { value } or { error }.
function normalizeBody(body) {
    const transactionType = str(body.transactionType);
    if (!transactionType) return { error: 'Transaction type is required.' };
    if (transactionType.length > 50) return { error: 'Transaction type must be 50 characters or fewer.' };

    const chargeType = str(body.chargeType);
    if (!CHARGE_TYPE_KEYS.includes(chargeType)) return { error: 'Select a valid charge type.' };

    // Green fees, buggy fees and caddy fees may name the golfer category they
    // are the DEFAULT for (green fee: the registration auto-billing key;
    // buggy/caddy: the category's only tile on the bill). Optional - NULL = a
    // manual item for everyone. Other charge types stay NULL.
    let golferType = null;
    if (GOLFER_TYPED_CHARGE_TYPE_KEYS.includes(chargeType)) {
        const raw = str(body.golferType);
        if (raw) {
            if (!GOLFER_TYPE_KEYS.includes(raw)) return { error: 'Select a valid golfer type for the default.' };
            golferType = raw;
        }
    }

    return {
        value: {
            transactionType,
            chargeType,
            golferType,
            description: typeof body.description === 'string' ? body.description.trim() || null : null,
            // Packages DO carry their own tax scheme (spec 2026-08-28): it is
            // applied to ALL bill lines generated from the package, with the
            // last line rounding-adjusted so the line taxes sum to the tax
            // computed directly on the package amount.
            taxSchemeCode: str(body.taxSchemeCode) || null,
            allowPriceOverride: body.allowPriceOverride === true,
            iconUrl: str(body.iconUrl) || null,
            // Packages only: where the automatic balance line posts.
            autoTransactionTypeId: chargeType === PACKAGE_CHARGE_TYPE_KEY ? (str(body.autoTransactionTypeId) || null) : null,
        },
    };
}

// At most one ACTIVE DEFAULT per (charge type, golfer category) - otherwise
// registration auto-billing / the bill tiles cannot resolve the item.
// Non-default types (golferType NULL) are unrestricted. Returns an error
// string or null.
async function activeDefaultConflict(companyId, chargeType, golferType, selfId) {
    if (!golferType) return null;
    const where = { companyId, chargeType, golferType, isActive: true };
    if (selfId) where.id = { [Op.ne]: selfId };
    const clash = await GolfTransactionType.findOne({ where });
    if (!clash) return null;
    const label = (GOLFER_TYPES.find((g) => g.key === golferType) || {}).label || golferType;
    const kind = (CHARGE_TYPES.find((c) => c.key === chargeType) || {}).label || chargeType;
    return `'${clash.transactionType}' is already the default ${kind.toLowerCase()} for ${label} - disable it first or clear the golfer-type default.`;
}

// The package's auto (balance-line) transaction type: required, same company,
// active, and not itself a package. Returns an error string or null.
async function validateAutoTransactionType(companyId, autoId, selfId) {
    if (!autoId) return 'Select the Auto Transaction Type - the automatic balance line posts to it.';
    if (autoId === selfId) return 'The Auto Transaction Type cannot be the package itself.';
    const row = await GolfTransactionType.findOne({ where: { id: autoId, companyId } });
    if (!row) return 'The Auto Transaction Type is not one of this company\'s transaction types.';
    if (row.chargeType === PACKAGE_CHARGE_TYPE_KEY) return 'The Auto Transaction Type cannot be a package.';
    if (row.isActive === false) return `'${row.transactionType}' is disabled and cannot be the Auto Transaction Type.`;
    return null;
}

// Parse one money amount: number or numeric string, >= 0, 2dp.
function parseAmount(v) {
    const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.round(n * 100) / 100;
}

// Validate + normalise the element lines of a PACKAGE payload against the
// company's catalog. `selfId` excludes the package being edited from the
// element pool. Returns { items } or { error }.
async function normalizeElements(body, companyId, selfId) {
    const raw = Array.isArray(body.packageItems) ? body.packageItems : [];
    if (raw.length === 0) return { error: 'A package needs at least one element.' };
    if (raw.length > 50) return { error: 'A package can hold at most 50 elements.' };

    const ids = raw.map((i) => (i && typeof i.elementTransactionTypeId === 'string' ? i.elementTransactionTypeId : ''));
    if (ids.some((id) => !id)) return { error: 'Every package element needs a transaction type.' };
    if (new Set(ids).size !== ids.length) return { error: 'A package cannot list the same element twice - use the quantity instead.' };
    if (selfId && ids.includes(selfId)) return { error: 'A package cannot contain itself.' };

    const elements = await GolfTransactionType.findAll({ where: { id: ids, companyId } });
    const byId = new Map(elements.map((e) => [e.id, e]));

    const items = [];
    for (let n = 0; n < raw.length; n += 1) {
        const line = raw[n];
        const el = byId.get(ids[n]);
        if (!el) return { error: 'A package element is not one of this company\'s transaction types.' };
        if (el.chargeType === PACKAGE_CHARGE_TYPE_KEY) return { error: `'${el.transactionType}' is itself a package - packages cannot be nested.` };
        if (el.isActive === false) return { error: `'${el.transactionType}' is disabled and cannot be added to a package.` };

        const quantity = Number(line.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
            return { error: 'Element quantity must be a whole number between 1 and 99.' };
        }
        const unitAmount = parseAmount(line.unitAmount);
        if (unitAmount === undefined) return { error: 'Element amounts must be 0.00 or more.' };

        items.push({ elementTransactionTypeId: el.id, quantity, unitAmount, sortOrder: n });
    }
    return { items };
}

// Replace a package's element lines atomically (inside the caller's txn).
async function writeElements(row, items, callerId, departmentId, transaction) {
    await GolfTransactionTypeElement.destroy({ where: { transactionTypeId: row.id }, transaction });
    if (items && items.length) {
        await GolfTransactionTypeElement.bulkCreate(
            items.map((i) => ({
                ...i,
                transactionTypeId: row.id,
                createdBy: callerId,
                createdByDepartmentId: departmentId,
                updatedBy: callerId,
            })),
            { transaction },
        );
    }
}

// The referenced tax scheme must be one the company can actually use (adopted /
// country-resolved via the tax seam) and OUTPUT-class (charges to players are
// revenue, never INPUT/purchase tax).
async function validateTaxScheme(req, taxSchemeCode) {
    if (!taxSchemeCode) return null;
    const { schemes } = await listCompanyTaxSchemes(req);
    const ok = (schemes || []).some(
        (r) => r.scheme.taxSchemeCode === taxSchemeCode && r.scheme.taxClass !== 'INPUT',
    );
    return ok ? null : 'Tax scheme not found for this company (or is an INPUT scheme).';
}

// GET /api/golf/transaction-types/meta - the charge-type options, plus which
// of them price by the 8-cell matrix (the rest take a flat amount).
exports.getMeta = async (req, res) => {
    res.status(200).json({ chargeTypes: CHARGE_TYPES, matrixChargeTypes: MATRIX_CHARGE_TYPE_KEYS, golferTypes: GOLFER_TYPES });
};

// GET /api/golf/transaction-types/tax-schemes - the company's usable OUTPUT
// tax schemes for the picker.
exports.getTaxSchemes = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const { scope, schemes } = await listCompanyTaxSchemes(req);
        const list = (schemes || [])
            .filter((r) => r.scheme.taxClass !== 'INPUT')
            .map((r) => ({ taxSchemeCode: r.scheme.taxSchemeCode, name: r.scheme.name }));
        res.status(200).json({ schemes: list, countrySet: !!scope });
    } catch (error) {
        console.error('Error listing tax schemes for golf transaction types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/transaction-types/icon  (multipart, field "icon")
// Upload the billing-item icon to GCS and return its public URL; the caller
// stores the URL via create/update (same shape as the course picture flow).
exports.uploadIcon = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        if (!req.file) return res.status(400).json({ message: 'No image file uploaded.' });

        const bucket = assetsBucket();
        const fileExtension = req.file.originalname.split('.').pop();
        const gcsFileName = `golf-txn-type-${companyId}-${Date.now()}.${fileExtension}`;
        const blob = bucket.file(gcsFileName);
        await blob.save(req.file.buffer, { resumable: false, contentType: req.file.mimetype });
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
        res.status(200).json({ message: 'Icon uploaded.', url: publicUrl });
    } catch (error) {
        console.error('Transaction type icon upload error:', error);
        res.status(500).json({ message: error.message || 'Failed to upload icon.' });
    }
};

// GET /api/golf/transaction-types - every transaction type for the company.
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const rows = await GolfTransactionType.findAll({
            where: { companyId },
            include: [
                { model: GolfTransactionTypeElement, as: 'Elements' },
                { model: GolfTransactionTypeEligibility, as: 'Eligibility' },
            ],
            order: [['transactionType', 'ASC']],
        });
        const flags = await annotateCanModify(req, rows);
        res.status(200).json(rows.map((r, i) => toDto(r, flags[i])));
    } catch (error) {
        console.error('Error listing golf transaction types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/transaction-types
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const parsed = normalizeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        const taxErr = await validateTaxScheme(req, v.taxSchemeCode);
        if (taxErr) return res.status(400).json({ message: taxErr });

        const existing = await GolfTransactionType.findOne({ where: { companyId, transactionType: v.transactionType } });
        if (existing) return res.status(409).json({ message: `Transaction type '${v.transactionType}' already exists.` });

        const gfErr = await activeDefaultConflict(companyId, v.chargeType, v.golferType, null);
        if (gfErr) return res.status(409).json({ message: gfErr });

        const isPackage = v.chargeType === PACKAGE_CHARGE_TYPE_KEY;
        let items = null;
        let eligibility = null;
        if (isPackage) {
            const parsedItems = await normalizeElements(req.body, companyId, null);
            if (parsedItems.error) return res.status(400).json({ message: parsedItems.error });
            items = parsedItems.items;
            const autoErr = await validateAutoTransactionType(companyId, v.autoTransactionTypeId, null);
            if (autoErr) return res.status(400).json({ message: autoErr });
            const parsedElig = normalizeEligibility(req.body);
            if (parsedElig.error) return res.status(400).json({ message: parsedElig.error });
            eligibility = parsedElig.rows;
        }

        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const row = await sequelize.transaction(async (transaction) => {
            const created = await GolfTransactionType.create({
                companyId,
                ...v,
                createdBy: callerId,
                createdByDepartmentId: placement.departmentId,
                updatedBy: callerId,
            }, { transaction });
            if (isPackage) {
                await writeElements(created, items, callerId, placement.departmentId, transaction);
                await writeEligibility(created, eligibility, callerId, placement.departmentId, transaction);
            }
            return created;
        });
        if (isPackage) {
            row.Elements = await GolfTransactionTypeElement.findAll({ where: { transactionTypeId: row.id } });
            row.Eligibility = await GolfTransactionTypeEligibility.findAll({ where: { transactionTypeId: row.id } });
        }
        res.status(201).json({ message: `Transaction type '${row.transactionType}' created.`, transactionType: toDto(row) });
    } catch (error) {
        console.error('Error creating golf transaction type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/golf/transaction-types/:id - full update.
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const row = await GolfTransactionType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Transaction type not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        const parsed = normalizeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        const taxErr = await validateTaxScheme(req, v.taxSchemeCode);
        if (taxErr) return res.status(400).json({ message: taxErr });

        if (v.transactionType !== row.transactionType) {
            const clash = await GolfTransactionType.findOne({ where: { companyId, transactionType: v.transactionType } });
            if (clash) return res.status(409).json({ message: `Transaction type '${v.transactionType}' already exists.` });
        }

        if (row.isActive !== false) {
            const gfErr = await activeDefaultConflict(companyId, v.chargeType, v.golferType, row.id);
            if (gfErr) return res.status(409).json({ message: gfErr });
        }

        const isPackage = v.chargeType === PACKAGE_CHARGE_TYPE_KEY;
        let items = null;
        let eligibility = null;
        if (isPackage) {
            const parsedItems = await normalizeElements(req.body, companyId, row.id);
            if (parsedItems.error) return res.status(400).json({ message: parsedItems.error });
            items = parsedItems.items;
            const autoErr = await validateAutoTransactionType(companyId, v.autoTransactionTypeId, row.id);
            if (autoErr) return res.status(400).json({ message: autoErr });
            const parsedElig = normalizeEligibility(req.body);
            if (parsedElig.error) return res.status(400).json({ message: parsedElig.error });
            eligibility = parsedElig.rows;
        }
        // An element that other packages use cannot be turned INTO a package
        // (packages cannot nest).
        if (isPackage && row.chargeType !== PACKAGE_CHARGE_TYPE_KEY) {
            const usedBy = await GolfTransactionTypeElement.count({ where: { elementTransactionTypeId: row.id } });
            if (usedBy > 0) return res.status(409).json({ message: 'This transaction type is an element of existing packages and cannot become a package itself.' });
        }

        const callerId = getUserContext(req).userId;
        const placement = await getCallerPlacement(req);
        await sequelize.transaction(async (transaction) => {
            Object.assign(row, v);
            row.updatedBy = callerId;
            await row.save({ transaction });
            // Replace the element + eligibility sets for packages; clear any
            // leftovers when a package was changed to a plain charge type.
            await writeElements(row, isPackage ? items : [], callerId, placement.departmentId, transaction);
            await writeEligibility(row, isPackage ? eligibility : [], callerId, placement.departmentId, transaction);
        });
        if (isPackage) {
            row.Elements = await GolfTransactionTypeElement.findAll({ where: { transactionTypeId: row.id } });
            row.Eligibility = await GolfTransactionTypeEligibility.findAll({ where: { transactionTypeId: row.id } });
        }
        res.status(200).json({ message: `Transaction type '${row.transactionType}' updated.`, transactionType: toDto(row) });
    } catch (error) {
        console.error('Error updating golf transaction type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/golf/transaction-types/:id - toggle isActive only.
exports.setActive = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const row = await GolfTransactionType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Transaction type not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        if (typeof req.body.isActive === 'boolean') {
            if (req.body.isActive === true) {
                const gfErr = await activeDefaultConflict(companyId, row.chargeType, row.golferType, row.id);
                if (gfErr) return res.status(409).json({ message: gfErr });
            }
            row.isActive = req.body.isActive;
            row.updatedBy = getUserContext(req).userId;
            await row.save();
        }
        res.status(200).json({ message: `Transaction type '${row.transactionType}' updated.`, transactionType: toDto(row) });
    } catch (error) {
        console.error('Error updating golf transaction type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
