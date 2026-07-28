// Membership import (Excel -> staging -> selective migration).
//
// The user's flow: upload a two-sheet workbook (Memberships + Members), every
// row lands in the staging mid-tables validated, the screen shows the file
// grouped per membership, the user ticks which memberships to migrate, and
// migration creates the REAL Membership/Member/Address rows with the same
// invariants as manual entry - minus the welcome email (user decision
// 2026-07-20: legacy members are migrated silently) and with existing numbers
// blocking as errors (imports never update existing records).

const ExcelJS = require('exceljs');
const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const Membership = require('./membership.model');
const Member = require('./member.model');
const MembershipType = require('./membershipType.model');
const MembershipStatus = require('./membershipStatus.model');
const MembershipFee = require('./membershipFee.model');
const SalesAgent = require('./salesAgent.model');
const Address = require('./address.model');
const MembershipImportBatch = require('./membershipImportBatch.model');
const MembershipImportRow = require('./membershipImportRow.model');
const {
    DEPENDENT_TYPE_KEYS,
    EXPIRING_DEPENDENT_TYPES,
    GENDER_KEYS,
    MARITAL_STATUS_KEYS,
    CREDIT_FLAG_KEYS,
    STATEMENT_MODE_KEYS,
} = require('./member.constants');

// ---------------------------------------------------------------------------
// Column specs - ONE source of truth for the downloadable template AND the
// parser (headers are matched case-insensitively, '*' stripped).

const MEMBERSHIP_COLUMNS = [
    { header: 'Membership No', key: 'membershipNo', hint: 'Blank = auto-issued when the club auto-numbers' },
    { header: 'Type Code *', key: 'typeCode', hint: 'Membership Type category code' },
    { header: 'Status', key: 'status', hint: 'Status name; blank = the type\'s default' },
    { header: 'Fee Code', key: 'feeCode', hint: 'Membership Fee code; blank = the type\'s default' },
    { header: 'Join Date *', key: 'joinDate', hint: 'YYYY-MM-DD' },
    { header: 'Expiry Date', key: 'expiryDate', hint: 'Blank on a term type = auto (day before anniversary)' },
    { header: 'Billing Date', key: 'billingDate', hint: 'Corporate only' },
    { header: 'Credit Flag', key: 'creditFlag', hint: 'personal | combined (individual only)' },
    { header: 'Credit Limit', key: 'creditLimit' },
    { header: 'Terms (days)', key: 'terms' },
    { header: 'Statement Mode', key: 'statementMode', hint: 'individual | combined' },
    { header: 'Send Reminders', key: 'sendReminders', hint: 'Y / N' },
    { header: 'Charge Interest', key: 'chargeInterest', hint: 'Y / N' },
    { header: 'Monthly Fee', key: 'monthlyFee', hint: 'Y / N' },
    { header: 'Yearly Fee', key: 'yearlyFee', hint: 'Y / N' },
    { header: 'Certificate No', key: 'certificateNo' },
    { header: 'Application No', key: 'applicationNo' },
    { header: 'Reference', key: 'reference' },
    { header: 'Proposer', key: 'proposer', hint: 'Committee clubs' },
    { header: 'Sales Agent Code', key: 'salesAgentCode', hint: 'Commercial clubs' },
    { header: 'Followup Agent Code', key: 'followupAgentCode' },
    { header: 'Corporate Name', key: 'corporateName', hint: 'Required for a corporate type' },
    { header: 'Registration No', key: 'registrationNo' },
    { header: 'Tax No', key: 'taxNo' },
    { header: 'Contact Person', key: 'contactPerson' },
    { header: 'Contact Designation', key: 'contactDesignation' },
    { header: 'Phone', key: 'phone' },
    { header: 'Fax', key: 'fax' },
    { header: 'Mobile', key: 'mobile' },
    { header: 'Email', key: 'email' },
    { header: 'Industry Code', key: 'industryTypeCode' },
    { header: 'Residential Address', key: 'resAddress' },
    { header: 'Residential City', key: 'resCity' },
    { header: 'Residential Postcode', key: 'resPostcode' },
    { header: 'Residential State', key: 'resState' },
    { header: 'Residential Country', key: 'resCountry', hint: 'ISO alpha-2, e.g. my' },
    { header: 'Mailing Address', key: 'mailAddress' },
    { header: 'Mailing City', key: 'mailCity' },
    { header: 'Mailing Postcode', key: 'mailPostcode' },
    { header: 'Mailing State', key: 'mailState' },
    { header: 'Mailing Country', key: 'mailCountry' },
    { header: 'Remarks', key: 'remarks' },
];

const MEMBER_COLUMNS = [
    { header: 'Membership No *', key: 'membershipNo', hint: 'Must match a row on the Memberships sheet' },
    { header: 'Member No', key: 'memberNo', hint: 'Blank = derived (individual: the membership no; dependent/nominee: parent-A, -B, ...)' },
    { header: 'Kind *', key: 'kind', hint: 'individual | nominee | dependent' },
    { header: 'Dependent Type', key: 'dependentType', hint: 'spouse | son | daughter | ward' },
    { header: 'Parent Member No', key: 'parentMemberNo', hint: 'The member a dependent hangs under; blank on an individual membership = its member' },
    { header: 'Status', key: 'status', hint: 'Blank = follows the membership' },
    { header: 'Salutation Code', key: 'salutationCode' },
    { header: 'Title Code', key: 'titleCode' },
    { header: 'First Name', key: 'firstName' },
    { header: 'Middle Name', key: 'middleName' },
    { header: 'Last Name *', key: 'lastName' },
    { header: 'Name on Card', key: 'nameOnCard' },
    { header: 'Local Name', key: 'localName' },
    { header: 'Gender', key: 'gender', hint: 'male | female' },
    { header: 'Birth Date', key: 'birthDate', hint: 'YYYY-MM-DD' },
    { header: 'Identity No', key: 'identityNo' },
    { header: 'Nationality Code', key: 'nationalityCode' },
    { header: 'Race Code', key: 'raceCode' },
    { header: 'Marital Status', key: 'maritalStatus', hint: 'single | married | divorced | widowed' },
    { header: 'Marital Date', key: 'maritalDate' },
    { header: 'Phone', key: 'phone' },
    { header: 'Mobile', key: 'mobile' },
    { header: 'Fax', key: 'fax' },
    { header: 'Email', key: 'email' },
    { header: 'Employer', key: 'employerName' },
    { header: 'Designation', key: 'designation' },
    { header: 'Industry Code', key: 'industryTypeCode' },
    { header: 'Join Date', key: 'joinDate' },
    { header: 'Expiry Date', key: 'expiryDate' },
    { header: 'Credit Limit', key: 'creditLimit' },
    { header: 'Residential Address', key: 'resAddress' },
    { header: 'Residential City', key: 'resCity' },
    { header: 'Residential Postcode', key: 'resPostcode' },
    { header: 'Residential State', key: 'resState' },
    { header: 'Residential Country', key: 'resCountry' },
    { header: 'Mailing Address', key: 'mailAddress' },
    { header: 'Mailing City', key: 'mailCity' },
    { header: 'Mailing Postcode', key: 'mailPostcode' },
    { header: 'Mailing State', key: 'mailState' },
    { header: 'Mailing Country', key: 'mailCountry' },
    { header: 'Remarks', key: 'remarks' },
];

const SHEET_MEMBERSHIPS = 'Memberships';
const SHEET_MEMBERS = 'Members';

// ---------------------------------------------------------------------------
// Template

// A blank workbook with both sheets, styled headers and a hint row, so clubs
// fill a known shape instead of guessing (show-expected-results).
async function buildTemplate() {
    const wb = new ExcelJS.Workbook();
    for (const [name, cols] of [[SHEET_MEMBERSHIPS, MEMBERSHIP_COLUMNS], [SHEET_MEMBERS, MEMBER_COLUMNS]]) {
        const ws = wb.addWorksheet(name);
        ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: Math.max(14, c.header.length + 2) }));
        ws.getRow(1).font = { bold: true };
        ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        const hints = ws.addRow(cols.map((c) => c.hint || ''));
        hints.font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
        ws.views = [{ state: 'frozen', ySplit: 1 }];
    }
    return wb.xlsx.writeBuffer();
}

// ---------------------------------------------------------------------------
// Parsing

// Excel cell -> trimmed string (dates -> YYYY-MM-DD; rich text / hyperlink /
// formula cells unwrapped). Empty -> null.
function cellText(cell) {
    let v = cell && cell.value;
    if (v === null || v === undefined) return null;
    if (v instanceof Date) {
        // exceljs date cells are UTC-anchored - use UTC parts, never local.
        const y = v.getUTCFullYear();
        const m = String(v.getUTCMonth() + 1).padStart(2, '0');
        const d = String(v.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    if (typeof v === 'object') {
        if (v.richText) v = v.richText.map((r) => r.text).join('');
        else if (v.result !== undefined) v = v.result instanceof Date ? cellText({ value: v.result }) : v.result;
        else if (v.text !== undefined) v = v.text; // hyperlink cells (emails)
        else v = String(v);
    }
    const s = String(v).trim();
    return s || null;
}

function normHeader(h) {
    return String(h || '').replace(/\*/g, '').trim().toLowerCase();
}

// Read one sheet into [{ rowNo, data }] using the column spec; header row is
// matched by name so extra/reordered columns don't break the file.
function parseSheet(ws, cols) {
    if (!ws) return null;
    const byHeader = new Map(cols.map((c) => [normHeader(c.header), c.key]));
    const colKeys = {}; // column index -> our key
    ws.getRow(1).eachCell((cell, colNo) => {
        const key = byHeader.get(normHeader(cellText(cell)));
        if (key) colKeys[colNo] = key;
    });
    if (Object.keys(colKeys).length === 0) return null;

    const rows = [];
    ws.eachRow((row, rowNo) => {
        if (rowNo === 1) return;
        const data = {};
        let hasValue = false;
        for (const [colNo, key] of Object.entries(colKeys)) {
            const text = cellText(row.getCell(Number(colNo)));
            data[key] = text;
            if (text) hasValue = true;
        }
        // Skip blank lines and the template's italic hint row.
        if (!hasValue) return;
        rows.push({ rowNo, data });
    });
    return rows;
}

// The template ships a hint row directly under the headers - drop it if the
// club left it in (recognised by the hint text of the first required column).
function stripHintRow(rows, sentinel) {
    if (rows.length && String(rows[0].data.typeCode || rows[0].data.kind || '').includes(sentinel)) rows.shift();
    return rows;
}

function parseWorkbookRows(wb) {
    const membershipSheet = wb.getWorksheet(SHEET_MEMBERSHIPS) || wb.worksheets[0];
    const memberSheet = wb.getWorksheet(SHEET_MEMBERS) || wb.worksheets[1];
    const memberships = parseSheet(membershipSheet, MEMBERSHIP_COLUMNS);
    if (!memberships) {
        return { error: `Sheet '${SHEET_MEMBERSHIPS}' with the template headers was not found.` };
    }
    const members = memberSheet ? parseSheet(memberSheet, MEMBER_COLUMNS) || [] : [];
    stripHintRow(memberships, 'category code');
    stripHintRow(members, 'individual | nominee');
    return { memberships, members };
}

// ---------------------------------------------------------------------------
// Shared coercers (same rules as the manual-entry controller).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function asDate(v) {
    if (!v) return null;
    if (!DATE_RE.test(v) || Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())) return undefined;
    return v;
}
function asBool(v) {
    if (!v) return false;
    return ['y', 'yes', 'true', '1'].includes(String(v).trim().toLowerCase());
}
function asNumber(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : undefined;
}
function low(v) {
    return v ? String(v).trim().toLowerCase() : null;
}

// The typed address rows an import row carries (residential + mailing sets).
function addressesOf(d) {
    const rows = [];
    if (d.resAddress) {
        rows.push({ addressType: 'residential', address: d.resAddress, city: d.resCity, postcode: d.resPostcode, state: d.resState, countryCode: low(d.resCountry) });
    }
    if (d.mailAddress) {
        rows.push({ addressType: 'mailing', address: d.mailAddress, city: d.mailCity, postcode: d.mailPostcode, state: d.mailState, countryCode: low(d.mailCountry) });
    }
    return rows;
}

// ---------------------------------------------------------------------------
// Validation (at staging time; re-checked at migration)

// Company lookups used by both validation and migration, loaded once.
async function loadLookups(companyId) {
    const [types, statuses, fees, agents] = await Promise.all([
        MembershipType.findAll({ where: { companyId } }),
        MembershipStatus.findAll({ where: { companyId } }),
        MembershipFee.findAll({ where: { companyId } }),
        SalesAgent.findAll({ where: { companyId }, attributes: ['id', 'agentCode', 'isActive'] }),
    ]);
    return {
        typeByCode: new Map(types.map((t) => [t.category.toLowerCase(), t])),
        statusByName: new Map(statuses.map((s) => [s.membershipStatus.toLowerCase(), s])),
        feeByCode: new Map(fees.map((f) => [f.membershipFeeCode.toLowerCase(), f])),
        agentByCode: new Map(agents.map((a) => [a.agentCode.toLowerCase(), a])),
    };
}

// Validate everything; mutates each staged row object ({ data, issues }).
// `numberingMode`: 'auto' | 'manual' | null (null behaves as manual).
async function validateStagedRows(companyId, memberships, members, lookups, numberingMode) {
    const err = (row, message) => row.issues.push({ level: 'error', message });
    const warn = (row, message) => row.issues.push({ level: 'warning', message });

    // --- membership sheet ---
    const byNo = new Map(); // membershipNo(lower) -> staged membership row
    for (const row of memberships) {
        const d = row.data;
        row.issues = [];

        const type = d.typeCode ? lookups.typeByCode.get(d.typeCode.toLowerCase()) : null;
        if (!type) err(row, `Type code '${d.typeCode || ''}' not found.`);
        else if (!type.isActive) err(row, `Membership type '${type.category}' is disabled.`);
        if (type) {
            d.membershipClass = type.membershipClass;
            if (type.membershipClass === 'corporate' && !d.corporateName) {
                err(row, 'Corporate Name is required for a corporate type.');
            }
        }

        if (!d.joinDate) err(row, 'Join Date is required.');
        for (const [label, key] of [['Join Date', 'joinDate'], ['Expiry Date', 'expiryDate'], ['Billing Date', 'billingDate']]) {
            if (d[key] && asDate(d[key]) === undefined) err(row, `${label} must be a valid date (YYYY-MM-DD).`);
        }
        if (d.joinDate && d.expiryDate && asDate(d.joinDate) && asDate(d.expiryDate) && d.expiryDate <= d.joinDate) {
            err(row, 'Expiry Date must be after the Join Date.');
        }

        if (d.status && !lookups.statusByName.get(d.status.toLowerCase())) err(row, `Status '${d.status}' not found.`);
        if (!d.status && type && !type.defaultMembershipStatusId) {
            err(row, `Status is required (type '${type.category}' has no default status).`);
        }
        if (d.feeCode && !lookups.feeByCode.get(d.feeCode.toLowerCase())) err(row, `Fee code '${d.feeCode}' not found.`);
        if (d.creditFlag && !CREDIT_FLAG_KEYS.includes(low(d.creditFlag))) err(row, `Credit Flag must be one of: ${CREDIT_FLAG_KEYS.join(', ')}.`);
        if (d.statementMode && !STATEMENT_MODE_KEYS.includes(low(d.statementMode))) err(row, `Statement Mode must be one of: ${STATEMENT_MODE_KEYS.join(', ')}.`);
        if (asNumber(d.creditLimit) === undefined || (asNumber(d.creditLimit) ?? 0) < 0) err(row, 'Credit Limit must be a non-negative number.');
        if (d.terms && (!Number.isInteger(asNumber(d.terms)) || asNumber(d.terms) < 0)) err(row, 'Terms must be a whole number of days.');

        for (const [label, key] of [['Sales Agent Code', 'salesAgentCode'], ['Followup Agent Code', 'followupAgentCode']]) {
            if (d[key] && !lookups.agentByCode.get(d[key].toLowerCase())) err(row, `${label} '${d[key]}' not found.`);
        }

        // Numbering.
        if (!d.membershipNo && numberingMode !== 'auto') {
            err(row, 'Membership No is required (no auto-numbering scheme is active).');
        }
        if (d.membershipNo) {
            const key = d.membershipNo.toLowerCase();
            if (byNo.has(key)) err(row, `Membership No '${d.membershipNo}' appears more than once in the file.`);
            else byNo.set(key, row);
        }
    }

    // Existing numbers in the REAL tables block as errors (imports never update).
    const fileNos = [...byNo.values()].map((r) => r.data.membershipNo);
    if (fileNos.length) {
        const existing = await Membership.findAll({ where: { companyId, membershipNo: fileNos }, attributes: ['membershipNo'] });
        for (const e of existing) {
            const row = byNo.get(e.membershipNo.toLowerCase());
            if (row) err(row, `Membership No '${e.membershipNo}' already exists - imports never update existing records.`);
        }
    }

    // --- members sheet ---
    const membersByMembership = new Map(); // membershipNo(lower) -> member rows
    const memberNos = new Map(); // memberNo(lower) -> staged member row
    for (const row of members) {
        const d = row.data;
        row.issues = [];

        const msKey = d.membershipNo ? d.membershipNo.toLowerCase() : null;
        const parent = msKey ? byNo.get(msKey) : null;
        if (!parent) err(row, `Membership No '${d.membershipNo || ''}' has no row on the Memberships sheet.`);
        else {
            if (!membersByMembership.has(msKey)) membersByMembership.set(msKey, []);
            membersByMembership.get(msKey).push(row);
        }

        const kind = low(d.kind);
        d.kind = kind;
        if (!['individual', 'nominee', 'dependent'].includes(kind)) {
            err(row, "Kind must be 'individual', 'nominee' or 'dependent'.");
        } else if (parent) {
            const cls = parent.data.membershipClass;
            if (kind === 'individual' && cls === 'corporate') err(row, 'A corporate membership has nominees, not an individual member.');
            if (kind === 'nominee' && cls === 'individual') err(row, 'Nominees only exist on a corporate membership.');
        }
        if (kind === 'dependent') {
            if (!DEPENDENT_TYPE_KEYS.includes(low(d.dependentType))) {
                err(row, `Dependent Type must be one of: ${DEPENDENT_TYPE_KEYS.join(', ')}.`);
            }
        } else if (d.dependentType) {
            warn(row, 'Dependent Type is ignored for a non-dependent.');
        }

        if (!d.lastName) err(row, 'Last Name is required.');
        if (d.gender && !GENDER_KEYS.includes(low(d.gender))) err(row, `Gender must be one of: ${GENDER_KEYS.join(', ')}.`);
        if (d.maritalStatus && !MARITAL_STATUS_KEYS.includes(low(d.maritalStatus))) err(row, `Marital Status must be one of: ${MARITAL_STATUS_KEYS.join(', ')}.`);
        for (const [label, key] of [['Birth Date', 'birthDate'], ['Marital Date', 'maritalDate'], ['Join Date', 'joinDate'], ['Expiry Date', 'expiryDate']]) {
            if (d[key] && asDate(d[key]) === undefined) err(row, `${label} must be a valid date (YYYY-MM-DD).`);
        }
        if (asNumber(d.creditLimit) === undefined || (asNumber(d.creditLimit) ?? 0) < 0) err(row, 'Credit Limit must be a non-negative number.');
        if (d.status && !lookups.statusByName.get(d.status.toLowerCase())) err(row, `Status '${d.status}' not found.`);

        if (d.memberNo) {
            const key = d.memberNo.toLowerCase();
            if (memberNos.has(key)) err(row, `Member No '${d.memberNo}' appears more than once in the file.`);
            else memberNos.set(key, row);
        }
    }

    // Existing member numbers block too (a membership number doubles as the
    // individual's member number, so check the file's membership numbers there).
    const allNos = [...memberNos.keys(), ...byNo.keys()];
    if (allNos.length) {
        const existing = await Member.findAll({
            where: { companyId, memberNo: { [Op.in]: [...memberNos.values()].map((r) => r.data.memberNo).concat(fileNos) } },
            attributes: ['memberNo'],
        });
        for (const e of existing) {
            const row = memberNos.get(e.memberNo.toLowerCase()) || byNo.get(e.memberNo.toLowerCase());
            if (row) row.issues.push({ level: 'error', message: `Member No '${e.memberNo}' already exists - imports never update existing records.` });
        }
    }

    // Per-membership structural rules.
    for (const [msKey, msRow] of byNo.entries()) {
        const kids = membersByMembership.get(msKey) || [];
        const cls = msRow.data.membershipClass;
        const individuals = kids.filter((r) => r.data.kind === 'individual');
        const nominees = kids.filter((r) => r.data.kind === 'nominee');

        if (cls === 'individual') {
            if (individuals.length === 0) err(msRow, 'An individual membership needs its member row (Kind = individual) on the Members sheet.');
            if (individuals.length > 1) err(msRow, 'An individual membership can only have ONE individual member row.');
        }
        if (cls === 'corporate') {
            const type = msRow.data.typeCode ? lookups.typeByCode.get(msRow.data.typeCode.toLowerCase()) : null;
            if (type && type.noOfNominee != null && nominees.length > type.noOfNominee) {
                err(msRow, `Type '${type.category}' allows at most ${type.noOfNominee} nominee(s); the file has ${nominees.length}.`);
            }
        }

        // Dependents must resolve to a principal member IN THE FILE.
        const principals = new Map(); // memberNo(lower) -> row (non-dependents)
        for (const r of kids) {
            if (r.data.kind !== 'dependent' && r.data.memberNo) principals.set(r.data.memberNo.toLowerCase(), r);
        }
        for (const r of kids) {
            if (r.data.kind !== 'dependent') continue;
            if (r.data.parentMemberNo) {
                const p = principals.get(r.data.parentMemberNo.toLowerCase());
                if (!p) r.issues.push({ level: 'error', message: `Parent Member No '${r.data.parentMemberNo}' is not an individual/nominee row of this membership.` });
            } else if (cls === 'individual') {
                if (individuals.length !== 1) r.issues.push({ level: 'error', message: 'Cannot resolve the parent member.' });
            } else {
                r.issues.push({ level: 'error', message: 'Parent Member No is required for a dependent on a corporate membership.' });
            }
        }
    }

    // A membership can only migrate when it AND all its member rows are clean.
    for (const row of [...memberships, ...members]) {
        row.isValid = !row.issues.some((i) => i.level === 'error');
    }
    for (const [msKey, msRow] of byNo.entries()) {
        const kids = membersByMembership.get(msKey) || [];
        if (msRow.isValid && kids.some((r) => !r.isValid)) {
            msRow.issues.push({ level: 'error', message: 'One or more of its member rows has errors.' });
            msRow.isValid = false;
        }
    }
    // Membership rows without a number (auto mode) are grouped by row position:
    // members reference them by Membership No, so a blank number means its
    // member rows cannot link - block for clarity.
    for (const row of memberships) {
        if (!row.data.membershipNo && row.isValid) {
            const cls = row.data.membershipClass;
            if (cls === 'individual') {
                row.issues.push({ level: 'error', message: 'Blank Membership No cannot be linked to its member row - give it a file-local number or fill the real one.' });
                row.isValid = false;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Migration (selected memberships -> the real tables)

function profileFromRow(d) {
    const marital = low(d.maritalStatus);
    return {
        salutationCode: d.salutationCode || null,
        titleCode: d.titleCode || null,
        firstName: d.firstName || null,
        middleName: d.middleName || null,
        lastName: d.lastName,
        nameOnCard: d.nameOnCard || null,
        localName: d.localName || null,
        gender: low(d.gender),
        birthDate: asDate(d.birthDate) || null,
        identityNo: d.identityNo || null,
        nationalityCode: d.nationalityCode || null,
        raceCode: d.raceCode || null,
        maritalStatus: marital,
        maritalDate: marital === 'married' ? asDate(d.maritalDate) || null : null,
        phone: d.phone || null,
        mobile: d.mobile || null,
        fax: d.fax || null,
        email: d.email || null,
        employerName: d.employerName || null,
        designation: d.designation || null,
        industryTypeCode: d.industryTypeCode || null,
        joinDate: asDate(d.joinDate) || null,
        expiryDate: asDate(d.expiryDate) || null,
        creditLimit: asNumber(d.creditLimit),
        remarks: d.remarks || null,
    };
}

// Day-before-anniversary (same convention as manual entry).
function defaultTermExpiry(joinDateStr, termMonths) {
    const [y, m, d] = joinDateStr.split('-').map(Number);
    const targetMonthIndex = (m - 1) + termMonths;
    const ty = y + Math.floor(targetMonthIndex / 12);
    const tm = targetMonthIndex % 12;
    const daysInTarget = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
    const anniversary = Date.UTC(ty, tm, Math.min(d, daysInTarget));
    const eve = new Date(anniversary - 86400000);
    return `${eve.getUTCFullYear()}-${String(eve.getUTCMonth() + 1).padStart(2, '0')}-${String(eve.getUTCDate()).padStart(2, '0')}`;
}

function todayStr() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function migError(message) {
    const e = new Error(message);
    e.isMigrationError = true;
    return e;
}

// The next free '<parentNo>-X' suffix, considering DB rows AND numbers already
// taken inside this migration transaction.
async function nextChildNo(companyId, parentNo, takenInTx, transaction) {
    const existing = await Member.findAll({
        where: { companyId, memberNo: { [Op.like]: `${parentNo}-%` } },
        attributes: ['memberNo'],
        transaction,
    });
    const taken = new Set([...existing.map((m) => m.memberNo.toUpperCase()), ...takenInTx].map((s) => s.toUpperCase()));
    for (let i = 0; i < 26; i++) {
        const candidate = `${parentNo}-${String.fromCharCode(65 + i)}`;
        if (!taken.has(candidate.toUpperCase())) return candidate;
    }
    return `${parentNo}-${taken.size + 1}`;
}

async function assertNumberFree(companyId, no, transaction) {
    const [ms, mem] = await Promise.all([
        Membership.findOne({ where: { companyId, membershipNo: no }, attributes: ['id'], transaction }),
        Member.findOne({ where: { companyId, memberNo: no }, attributes: ['id'], transaction }),
    ]);
    if (ms) throw migError(`Membership number '${no}' is already in use.`);
    if (mem) throw migError(`Member number '${no}' is already in use.`);
}

// Migrate ONE staged membership (with its member rows) in its own transaction.
// Returns { membershipNo, membersCreated }. Throws migError on business fails.
async function migrateOne(req, companyId, msRow, memberRows, lookups, numberingMode, stamps, callerId) {
    const numberingGateway = require('../../platform/numberingGateway');
    const d = msRow.data;
    const type = lookups.typeByCode.get(d.typeCode.toLowerCase());
    if (!type || !type.isActive) throw migError(`Type '${d.typeCode}' is missing or disabled.`);
    const cls = type.membershipClass;

    const status = d.status
        ? lookups.statusByName.get(d.status.toLowerCase())
        : (await MembershipStatus.findOne({ where: { id: type.defaultMembershipStatusId || null, companyId } }));
    if (!status) throw migError('Membership status could not be resolved.');

    const fee = d.feeCode ? lookups.feeByCode.get(d.feeCode.toLowerCase()) : null;
    const membershipFeeId = fee ? fee.id : (type.defaultMembershipFeeId || null);

    const joinDate = asDate(d.joinDate);
    let expiryDate = asDate(d.expiryDate) || null;
    if (!expiryDate && type.isTermMembership && type.termMonths) {
        expiryDate = defaultTermExpiry(joinDate, type.termMonths);
    }
    let creditLimit = asNumber(d.creditLimit);
    if (creditLimit === null && type.creditLimit != null) creditLimit = Number(type.creditLimit);

    const agentOf = (code) => (code ? lookups.agentByCode.get(code.toLowerCase()) : null);

    return sequelize.transaction(async (t) => {
        let membershipNo = d.membershipNo || null;
        if (!membershipNo && numberingMode === 'auto') {
            const issued = await numberingGateway.issueNumber(req, 'membership', { typeCode: type.category, transaction: t });
            if (!issued || !issued.number) throw migError('Auto-numbering did not issue a number.');
            membershipNo = issued.number;
        }
        if (!membershipNo) throw migError('Membership number is required.');
        await assertNumberFree(companyId, membershipNo, t);

        const ms = await Membership.create({
            companyId,
            membershipNo,
            membershipClass: cls,
            membershipTypeId: type.id,
            membershipStatusId: status.id,
            statusDate: todayStr(),
            membershipFeeId,
            approvalStatus: 'approved',
            approvedAt: new Date(),
            approvedBy: callerId,
            joinDate,
            expiryDate,
            billingDate: cls === 'corporate' ? asDate(d.billingDate) || null : null,
            creditFlag: cls === 'individual' ? low(d.creditFlag) : null,
            creditLimit,
            terms: asNumber(d.terms),
            statementMode: low(d.statementMode),
            sendReminders: asBool(d.sendReminders),
            chargeInterest: asBool(d.chargeInterest),
            monthlyFee: asBool(d.monthlyFee),
            yearlyFee: asBool(d.yearlyFee),
            certificateNo: d.certificateNo || null,
            applicationNo: d.applicationNo || null,
            reference: d.reference || null,
            proposer: d.proposer || null,
            salesAgentId: agentOf(d.salesAgentCode)?.id || null,
            followupSalesAgentId: agentOf(d.followupAgentCode)?.id || null,
            remarks: d.remarks || null,
            ...(cls === 'corporate' ? {
                corporateName: d.corporateName,
                registrationNo: d.registrationNo || null,
                taxNo: d.taxNo || null,
                contactPerson: d.contactPerson || null,
                contactDesignation: d.contactDesignation || null,
                phone: d.phone || null,
                fax: d.fax || null,
                mobile: d.mobile || null,
                email: d.email || null,
                industryTypeCode: d.industryTypeCode || null,
            } : {}),
            ...stamps,
        }, { transaction: t });

        // Contract addresses (corporate only, mirroring manual entry).
        if (cls === 'corporate') {
            for (const a of addressesOf(d)) {
                await Address.create({ ...a, membershipId: ms.id, companyId, ...stamps }, { transaction: t });
            }
        }

        // Members: principals first (individual/nominees), then dependents.
        const createdByNo = new Map(); // file memberNo(lower)/derived -> Member row
        const takenInTx = [];
        const principals = memberRows.filter((r) => r.data.kind !== 'dependent');
        const dependents = memberRows.filter((r) => r.data.kind === 'dependent');

        const createMember = async (r, kind, principalMemberId, parentNo) => {
            const rd = r.data;
            const memberStatus = rd.status ? lookups.statusByName.get(rd.status.toLowerCase()) : status;
            const profile = profileFromRow(rd);
            if (kind === 'dependent' && !EXPIRING_DEPENDENT_TYPES.includes(low(rd.dependentType))) profile.expiryDate = null;

            let memberNo = rd.memberNo || null;
            if (!memberNo) {
                if (kind === 'individual') memberNo = membershipNo;
                else memberNo = await nextChildNo(companyId, parentNo || membershipNo, takenInTx, t);
            }
            if (memberNo !== membershipNo || kind !== 'individual') await assertNumberFree(companyId, memberNo, t);
            takenInTx.push(memberNo);

            const created = await Member.create({
                companyId,
                membershipId: ms.id,
                memberNo,
                memberKind: kind,
                dependentType: kind === 'dependent' ? low(rd.dependentType) : null,
                principalMemberId: principalMemberId || null,
                memberStatusId: memberStatus.id,
                statusDate: todayStr(),
                ...profile,
                joinDate: profile.joinDate || joinDate,
                ...stamps,
            }, { transaction: t });
            for (const a of addressesOf(rd)) {
                await Address.create({ ...a, memberId: created.id, companyId, ...stamps }, { transaction: t });
            }
            r.__created = created;
            if (rd.memberNo) createdByNo.set(rd.memberNo.toLowerCase(), created);
            createdByNo.set(memberNo.toLowerCase(), created);
            return created;
        };

        // Individual class keeps addresses on the PERSON (manual-entry rule),
        // but legacy exports often carry them at contract level - fall back to
        // the membership row's address columns when the person row has none.
        const individualRow = principals.find((p) => p.data.kind === 'individual');
        if (cls === 'individual' && individualRow && addressesOf(individualRow.data).length === 0) {
            const addrKeys = ['resAddress', 'resCity', 'resPostcode', 'resState', 'resCountry',
                'mailAddress', 'mailCity', 'mailPostcode', 'mailState', 'mailCountry'];
            const fallback = {};
            for (const k of addrKeys) fallback[k] = d[k];
            individualRow.data = { ...individualRow.data, ...fallback };
        }

        for (const r of principals) await createMember(r, r.data.kind, null, membershipNo);
        for (const r of dependents) {
            let principal;
            if (r.data.parentMemberNo) principal = createdByNo.get(r.data.parentMemberNo.toLowerCase());
            else principal = principals.find((p) => p.data.kind === 'individual')?.__created;
            if (!principal) throw migError(`Dependent row ${r.rowNo}: parent member not found.`);
            await createMember(r, 'dependent', principal.id, principal.memberNo);
        }

        // Mark the staged rows migrated inside the same tx.
        const now = new Date();
        await MembershipImportRow.update(
            { migrateStatus: 'migrated', migratedId: ms.id, migratedAt: now, updatedBy: callerId },
            { where: { id: msRow.id }, transaction: t },
        );
        for (const r of memberRows) {
            await MembershipImportRow.update(
                { migrateStatus: 'migrated', migratedId: r.__created ? r.__created.id : null, migratedAt: now, updatedBy: callerId },
                { where: { id: r.id }, transaction: t },
            );
        }

        return { membershipNo, membersCreated: memberRows.length };
    });
}

module.exports = {
    MEMBERSHIP_COLUMNS,
    MEMBER_COLUMNS,
    buildTemplate,
    parseWorkbookRows,
    loadLookups,
    validateStagedRows,
    migrateOne,
    addressesOf,
};
