// Membership Type import (Excel -> staging -> selective migration), mirroring
// the membership import: upload a one-sheet workbook, every row lands in the
// staging mid-tables validated, the user ticks which types to migrate, and
// migration creates the REAL MembershipType rows with the same invariants as
// manual entry. Existing category codes block as errors (imports never update
// existing records). Joining fees and standing charges are NOT part of the
// import - they stay maintained through their own dialogs on the Types screen.

const ExcelJS = require('exceljs');
const { sequelize } = require('../../platform/db');
const MembershipType = require('./membershipType.model');
const MembershipStatus = require('./membershipStatus.model');
const MembershipFee = require('./membershipFee.model');
const MembershipTypeImportRow = require('./membershipTypeImportRow.model');
const { parseSheet, asBool, asNumber, low } = require('./membershipImport.service');
const { MEMBERSHIP_CLASS_KEYS } = require('./membershipType.constants');

// ---------------------------------------------------------------------------
// Column spec - ONE source of truth for the downloadable template AND the
// parser (headers are matched case-insensitively, '*' stripped).

const TYPE_COLUMNS = [
    { header: 'Category Code *', key: 'category', hint: 'Unique code, e.g. ORD' },
    { header: 'Description', key: 'description' },
    { header: 'Class *', key: 'membershipClass', hint: 'individual | corporate' },
    { header: 'Golfing Access', key: 'isGolfAllow', hint: 'Y / N' },
    { header: 'Dependent Golfing', key: 'dependentGolfingAllow', hint: 'Y / N (needs Golfing Access)' },
    { header: 'Voting Right', key: 'votingRight', hint: 'Y / N' },
    { header: 'Transfer Right', key: 'transferRight', hint: 'Y / N' },
    { header: 'Term Membership', key: 'isTermMembership', hint: 'Y / N' },
    { header: 'Term Months', key: 'termMonths', hint: 'Required when Term Membership = Y' },
    { header: 'Child Age From', key: 'childAgeFrom', hint: 'Individual class only' },
    { header: 'Child Age To', key: 'childAgeTo' },
    { header: 'Play Times', key: 'playTimes', hint: 'Individual + golfing only' },
    { header: 'No of Nominees', key: 'noOfNominee', hint: 'Corporate class only' },
    { header: 'Nominee Category Code', key: 'nomineeCategoryCode', hint: 'Another type\'s code (in this file or already created)' },
    { header: 'Convert To Codes', key: 'convertToCodes', hint: 'Comma-separated type codes' },
    { header: 'Default Status', key: 'defaultStatus', hint: 'Status name from the Membership Status master' },
    { header: 'Default Fee Code', key: 'defaultFeeCode', hint: 'Code from the Membership Fee master' },
    { header: 'A/R Debtor Type', key: 'arDebtorType' },
    { header: 'Credit Limit', key: 'creditLimit' },
    { header: 'Active', key: 'isActive', hint: 'Y / N; blank = Y' },
];

const SHEET_TYPES = 'Membership Types';

// ---------------------------------------------------------------------------
// Template

// A blank workbook with the one sheet, styled headers and a hint row, so clubs
// fill a known shape instead of guessing (show-expected-results).
async function buildTemplate() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(SHEET_TYPES);
    ws.columns = TYPE_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: Math.max(14, c.header.length + 2) }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    const hints = ws.addRow(TYPE_COLUMNS.map((c) => c.hint || ''));
    hints.font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    return wb.xlsx.writeBuffer();
}

// ---------------------------------------------------------------------------
// Parsing

function parseWorkbookRows(wb) {
    const ws = wb.getWorksheet(SHEET_TYPES) || wb.worksheets[0];
    const types = parseSheet(ws, TYPE_COLUMNS);
    if (!types) {
        return { error: `Sheet '${SHEET_TYPES}' with the template headers was not found.` };
    }
    // Drop the template's italic hint row if the club left it in.
    if (types.length && String(types[0].data.membershipClass || '').includes('individual | corporate')) types.shift();
    return { types };
}

// 'A, B; C' -> ['A', 'B', 'C'] (deduped case-insensitively, original casing kept).
function splitCodes(v) {
    if (!v) return [];
    const seen = new Set();
    const out = [];
    for (const part of String(v).split(/[,;]/)) {
        const code = part.trim();
        if (!code || seen.has(code.toLowerCase())) continue;
        seen.add(code.toLowerCase());
        out.push(code);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Validation (at staging time; category clashes re-checked at migration)

// Company lookups used by both validation and migration, loaded once.
async function loadLookups(companyId) {
    const [types, statuses, fees] = await Promise.all([
        MembershipType.findAll({ where: { companyId }, attributes: ['id', 'category', 'isActive'] }),
        MembershipStatus.findAll({ where: { companyId }, attributes: ['id', 'membershipStatus'] }),
        MembershipFee.findAll({ where: { companyId }, attributes: ['id', 'membershipFeeCode'] }),
    ]);
    return {
        typeByCode: new Map(types.map((t) => [t.category.toLowerCase(), t])),
        statusByName: new Map(statuses.map((s) => [s.membershipStatus.toLowerCase(), s])),
        feeByCode: new Map(fees.map((f) => [f.membershipFeeCode.toLowerCase(), f])),
    };
}

// Validate everything; mutates each staged row object ({ data, issues,
// isValid }). Rules mirror the manual screen's normalizeTypeBody: hard rules
// are errors, class/golf-conditional fields that would be ignored are warnings.
function validateStagedRows(rows, lookups) {
    const err = (row, message) => row.issues.push({ level: 'error', message });
    const warn = (row, message) => row.issues.push({ level: 'warning', message });

    const byCode = new Map(); // category(lower) -> staged row (file-local refs)
    for (const row of rows) {
        row.issues = [];
        const d = row.data;
        if (d.category && d.category.length > 50) err(row, 'Category Code must be 50 characters or fewer.');
        if (!d.category) err(row, 'Category Code is required.');
        else {
            const key = d.category.toLowerCase();
            if (byCode.has(key)) err(row, `Category Code '${d.category}' appears more than once in the file.`);
            else byCode.set(key, row);
            // Existing categories block (imports never update existing records).
            if (lookups.typeByCode.has(key)) err(row, `Membership type '${d.category}' already exists - imports never update existing records.`);
        }
    }

    for (const row of rows) {
        const d = row.data;
        const cls = low(d.membershipClass);
        d.membershipClass = cls;
        if (!MEMBERSHIP_CLASS_KEYS.includes(cls)) {
            err(row, `Class must be one of: ${MEMBERSHIP_CLASS_KEYS.join(', ')}.`);
        }

        // Term membership needs its period; a period without the flag is ignored.
        const isTerm = asBool(d.isTermMembership);
        const termMonths = asNumber(d.termMonths);
        if (isTerm && (termMonths === null || termMonths === undefined || !Number.isInteger(termMonths) || termMonths < 1)) {
            err(row, 'A term membership needs Term Months (a whole number of at least 1).');
        }
        if (!isTerm && d.termMonths) warn(row, 'Term Months is ignored while Term Membership is N.');

        // Numbers.
        for (const [label, key] of [['Child Age From', 'childAgeFrom'], ['Child Age To', 'childAgeTo'], ['Play Times', 'playTimes'], ['No of Nominees', 'noOfNominee']]) {
            const n = asNumber(d[key]);
            if (d[key] && (n === undefined || !Number.isInteger(n) || n < 0)) err(row, `${label} must be a whole number of at least 0.`);
        }
        const creditLimit = asNumber(d.creditLimit);
        if (creditLimit === undefined || (creditLimit ?? 0) < 0) err(row, 'Credit Limit must be a non-negative number.');
        const from = asNumber(d.childAgeFrom);
        const to = asNumber(d.childAgeTo);
        if (Number.isInteger(from) && Number.isInteger(to) && from > to) err(row, 'Child Age "from" must not be greater than "to".');

        // Class-conditional fields the migration will null (mirror manual entry).
        if (cls === 'corporate') {
            if (d.childAgeFrom || d.childAgeTo) warn(row, 'Child ages are ignored for a corporate type.');
            if (d.playTimes) warn(row, 'Play Times is ignored for a corporate type.');
        }
        if (cls === 'individual') {
            if (d.noOfNominee) warn(row, 'No of Nominees is ignored for an individual type.');
            if (d.nomineeCategoryCode) warn(row, 'Nominee Category Code is ignored for an individual type.');
        }

        // Golf gates (mirror manual entry: golf-only settings need the access flag).
        if (!asBool(d.isGolfAllow)) {
            if (asBool(d.dependentGolfingAllow)) warn(row, 'Dependent Golfing is ignored without Golfing Access.');
            if (d.playTimes && cls === 'individual') warn(row, 'Play Times is ignored without Golfing Access.');
        }

        // Master-file references.
        if (d.defaultStatus && !lookups.statusByName.has(d.defaultStatus.toLowerCase())) {
            err(row, `Default Status '${d.defaultStatus}' not found in the Membership Status master.`);
        }
        if (d.defaultFeeCode && !lookups.feeByCode.has(d.defaultFeeCode.toLowerCase())) {
            err(row, `Default Fee Code '${d.defaultFeeCode}' not found in the Membership Fee master.`);
        }

        // Type references may point at existing types OR other rows in the file.
        const selfKey = d.category ? d.category.toLowerCase() : null;
        const resolvableType = (code) => {
            const key = code.toLowerCase();
            return lookups.typeByCode.has(key) || byCode.has(key);
        };
        if (cls === 'corporate' && d.nomineeCategoryCode) {
            const key = d.nomineeCategoryCode.toLowerCase();
            if (key === selfKey) err(row, 'A type cannot be its own nominee category.');
            else if (!resolvableType(d.nomineeCategoryCode)) {
                err(row, `Nominee Category Code '${d.nomineeCategoryCode}' is neither in this file nor an existing type.`);
            }
        }
        for (const code of splitCodes(d.convertToCodes)) {
            if (selfKey && code.toLowerCase() === selfKey) err(row, 'A type cannot convert to itself.');
            else if (!resolvableType(code)) {
                err(row, `Convert To code '${code}' is neither in this file nor an existing type.`);
            }
        }
    }

    for (const row of rows) {
        row.isValid = !row.issues.some((i) => i.level === 'error');
    }
}

// ---------------------------------------------------------------------------
// Migration (selected rows -> the real MembershipType table)

function migError(message) {
    const e = new Error(message);
    e.isMigrationError = true;
    return e;
}

// The scalar type payload of one staged row, with the class/golf-conditional
// nulling of manual entry. Type references (nominee/conversion) are linked in
// a second pass, once every selected row exists.
function typeValueOf(d) {
    const cls = d.membershipClass;
    const isGolfAllow = asBool(d.isGolfAllow);
    const isTermMembership = asBool(d.isTermMembership);
    const individual = cls === 'individual';
    return {
        category: d.category,
        description: d.description || null,
        membershipClass: cls,
        isGolfAllow,
        dependentGolfingAllow: isGolfAllow && asBool(d.dependentGolfingAllow),
        votingRight: asBool(d.votingRight),
        transferRight: asBool(d.transferRight),
        isTermMembership,
        termMonths: isTermMembership ? asNumber(d.termMonths) : null,
        conversionTargetIds: [],
        childAgeFrom: individual ? asNumber(d.childAgeFrom) : null,
        childAgeTo: individual ? asNumber(d.childAgeTo) : null,
        playTimes: individual && isGolfAllow ? asNumber(d.playTimes) : null,
        noOfNominee: individual ? null : asNumber(d.noOfNominee),
        nomineeCategoryId: null,
        arDebtorType: d.arDebtorType || null,
        creditLimit: asNumber(d.creditLimit),
        isActive: d.isActive == null || d.isActive === '' ? true : asBool(d.isActive),
    };
}

// Migrate the SELECTED staged rows. Pass 1 creates each type in its own
// transaction (one failure never rolls back the others); pass 2 links the
// nominee/conversion references against everything that now exists (pre-
// existing types + rows migrated in this or any earlier run). A reference to
// a file row that was NOT selected resolves once that row migrates too - until
// then the result carries a warning message.
async function migrateSelected(companyId, selectedRows, allBatchRows, lookups, stamps, callerId) {
    const results = [];
    const created = []; // { row, type }

    for (const row of selectedRows) {
        const d = row.data;
        const label = d.category || `row ${row.rowNo}`;
        if (!row.isValid) {
            results.push({ category: label, ok: false, message: 'Row has validation errors.' });
            continue;
        }
        if (row.migrateStatus === 'migrated') {
            results.push({ category: label, ok: false, message: 'Already migrated.' });
            continue;
        }
        try {
            const type = await sequelize.transaction(async (t) => {
                const clash = await MembershipType.findOne({ where: { companyId, category: d.category }, attributes: ['id'], transaction: t });
                if (clash) throw migError(`Membership type '${d.category}' already exists.`);

                const status = d.defaultStatus ? lookups.statusByName.get(d.defaultStatus.toLowerCase()) : null;
                const fee = d.defaultFeeCode ? lookups.feeByCode.get(d.defaultFeeCode.toLowerCase()) : null;
                const madeRow = await MembershipType.create({
                    companyId,
                    ...typeValueOf(d),
                    defaultMembershipStatusId: status ? status.id : null,
                    defaultMembershipFeeId: fee ? fee.id : null,
                    ...stamps,
                }, { transaction: t });

                await MembershipTypeImportRow.update(
                    { migrateStatus: 'migrated', migratedId: madeRow.id, migratedAt: new Date(), updatedBy: callerId },
                    { where: { id: row.id }, transaction: t },
                );
                return madeRow;
            });
            created.push({ row, type });
            results.push({ category: d.category, ok: true });
        } catch (err) {
            if (err && err.isMigrationError) {
                results.push({ category: label, ok: false, message: err.message });
            } else {
                console.error(`Type import migration failed for ${label}:`, err);
                results.push({ category: label, ok: false, message: 'Unexpected error - see server logs.' });
            }
        }
    }

    // Pass 2: link type references. Resolution set = the DB as it stands now
    // (includes this run's creations) plus this batch's migrated rows.
    if (created.length) {
        const allTypes = await MembershipType.findAll({ where: { companyId }, attributes: ['id', 'category'] });
        const idByCode = new Map(allTypes.map((t) => [t.category.toLowerCase(), t.id]));

        for (const { row, type } of created) {
            const d = row.data;
            const unresolved = [];
            const resolve = (code) => {
                const id = idByCode.get(code.toLowerCase());
                if (!id) unresolved.push(code);
                return id || null;
            };
            const nomineeId = d.membershipClass === 'corporate' && d.nomineeCategoryCode ? resolve(d.nomineeCategoryCode) : null;
            const targetIds = splitCodes(d.convertToCodes).map(resolve).filter(Boolean);
            if (nomineeId || targetIds.length) {
                await type.update({ nomineeCategoryId: nomineeId, conversionTargetIds: targetIds, updatedBy: callerId });
            }
            if (unresolved.length) {
                const r = results.find((x) => x.ok && x.category === d.category);
                if (r) r.message = `Created, but these referenced types are not migrated yet: ${unresolved.join(', ')}. Migrate them too, then re-link on the Types screen.`;
            }
        }
    }

    return results;
}

module.exports = {
    TYPE_COLUMNS,
    buildTemplate,
    parseWorkbookRows,
    loadLookups,
    validateStagedRows,
    migrateSelected,
};
