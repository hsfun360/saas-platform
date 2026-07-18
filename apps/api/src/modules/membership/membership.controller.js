// Membership / Member CRM (SRS 2.3) - Phase 1.
//
// Creation rules (user-defined domain model):
//   Individual membership -> one Member (kind 'individual') auto-created with it.
//   Corporate membership  -> no auto member; nominees created under it, capped by
//                            the type's noOfNominee.
//   Dependents            -> under an individual member OR a nominee.
//
// Numbering: the membership number comes from Numbering Control ('membership'
// purpose) in auto mode, or is keyed in (manual mode / no scheme). Nominee and
// dependent numbers default to the parent number + '-A/B/C...' (editable).

const { sequelize } = require('../../platform/db');
const { Op } = require('sequelize');
const Membership = require('./membership.model');
const Member = require('./member.model');
const MembershipType = require('./membershipType.model');
const MembershipStatus = require('./membershipStatus.model');
const MembershipFee = require('./membershipFee.model');
const {
    getUserContext,
    getCallerPlacement,
    getActiveCompany,
    canModifyRecord,
    annotateCanModify,
} = require('../../platform/serviceContext');
const { enqueueEmail } = require('../notification/emailOutbox');
const { signRegistrationToken } = require('./memberPortal.controller');
const { Storage } = require('@google-cloud/storage');

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:4200';

// Same GCS bucket as the company/platform logo and golf-course photo uploads
// (default credentials on Cloud Run); the stored value is the public URL.
const storage = new Storage();
const bucket = storage.bucket('membership-app-avatars-123');
const numberingGateway = require('../../platform/numberingGateway');
const {
    MEMBER_KINDS,
    DEPENDENT_TYPES,
    DEPENDENT_TYPE_KEYS,
    EXPIRING_DEPENDENT_TYPES,
    GENDERS,
    GENDER_KEYS,
    MARITAL_STATUSES,
    MARITAL_STATUS_KEYS,
    CREDIT_FLAGS,
    CREDIT_FLAG_KEYS,
    STATEMENT_MODES,
    STATEMENT_MODE_KEYS,
    ADDRESS_TYPES,
    ADDRESS_TYPE_KEYS,
} = require('./member.constants');
const Address = require('./address.model');
const { MEMBERSHIP_CLASS_KEYS } = require('./membershipType.constants');

const NUMBERING_PURPOSE = 'membership';

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

function numOrNull(v) {
    if (v === '' || v === null || v === undefined) return null;
    return Number(v);
}

// DATEONLY normaliser: '' -> null, else 'YYYY-MM-DD' (or error marker).
function dateOrNull(v) {
    const s = str(v);
    if (!s) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined; // invalid
    return s;
}

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

// joinDate + termMonths, minus one day - the term runs THROUGH the day before
// the anniversary (user-chosen convention). Month-end is clamped, so
// 2026-01-31 + 1 month lands on 2026-02-28 (not Mar 2), then minus one day.
function defaultTermExpiry(joinDateStr, termMonths) {
    const [y, m, d] = joinDateStr.split('-').map(Number);
    const targetMonthIndex = (m - 1) + termMonths;
    const targetYear = y + Math.floor(targetMonthIndex / 12);
    const targetMonth = targetMonthIndex % 12; // 0-based
    const daysInTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    const anniversary = Date.UTC(targetYear, targetMonth, Math.min(d, daysInTarget));
    const expiry = new Date(anniversary - 24 * 60 * 60 * 1000);
    return expiry.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// DTOs

function toMemberDto(m, extra = {}) {
    return {
        id: m.id,
        membershipId: m.membershipId,
        memberNo: m.memberNo,
        memberKind: m.memberKind,
        dependentType: m.dependentType,
        principalMemberId: m.principalMemberId,
        memberStatusId: m.memberStatusId,
        statusDate: m.statusDate,
        salutationCode: m.salutationCode,
        titleCode: m.titleCode,
        firstName: m.firstName,
        middleName: m.middleName,
        lastName: m.lastName,
        nameOnCard: m.nameOnCard,
        localName: m.localName,
        gender: m.gender,
        birthDate: m.birthDate,
        identityNo: m.identityNo,
        nationalityCode: m.nationalityCode,
        raceCode: m.raceCode,
        maritalStatus: m.maritalStatus,
        maritalDate: m.maritalDate,
        phone: m.phone,
        mobile: m.mobile,
        fax: m.fax,
        email: m.email,
        employerName: m.employerName,
        designation: m.designation,
        industryTypeCode: m.industryTypeCode,
        joinDate: m.joinDate,
        expiryDate: m.expiryDate,
        creditLimit: m.creditLimit == null ? null : Number(m.creditLimit),
        photoUrl: m.photoUrl,
        remarks: m.remarks,
        ...extra,
    };
}

function toMembershipDto(ms, extra = {}) {
    return {
        id: ms.id,
        companyId: ms.companyId,
        membershipNo: ms.membershipNo,
        membershipClass: ms.membershipClass,
        membershipTypeId: ms.membershipTypeId,
        membershipStatusId: ms.membershipStatusId,
        statusDate: ms.statusDate,
        membershipFeeId: ms.membershipFeeId,
        joinDate: ms.joinDate,
        expiryDate: ms.expiryDate,
        billingDate: ms.billingDate,
        creditFlag: ms.creditFlag,
        creditLimit: ms.creditLimit == null ? null : Number(ms.creditLimit),
        terms: ms.terms,
        statementMode: ms.statementMode,
        sendReminders: ms.sendReminders,
        chargeInterest: ms.chargeInterest,
        monthlyFee: ms.monthlyFee,
        yearlyFee: ms.yearlyFee,
        certificateNo: ms.certificateNo,
        applicationNo: ms.applicationNo,
        reference: ms.reference,
        proposer: ms.proposer,
        salesCode: ms.salesCode,
        followupSalesCode: ms.followupSalesCode,
        corporateName: ms.corporateName,
        registrationNo: ms.registrationNo,
        taxNo: ms.taxNo,
        contactPerson: ms.contactPerson,
        contactDesignation: ms.contactDesignation,
        phone: ms.phone,
        fax: ms.fax,
        mobile: ms.mobile,
        email: ms.email,
        industryTypeCode: ms.industryTypeCode,
        approvalStatus: ms.approvalStatus,
        remarks: ms.remarks,
        ...extra,
    };
}

// ---------------------------------------------------------------------------
// Validation / normalisation

// Contract-level fields shared by create and update. Returns { value } or
// { error }. Class-conditional fields are nulled for the other class.
function normalizeMembershipBody(body, membershipClass) {
    const joinDate = dateOrNull(body.joinDate);
    if (joinDate === undefined) return { error: 'Join date must be a valid date (YYYY-MM-DD).' };
    if (!joinDate) return { error: 'Join date is required.' };

    const expiryDate = dateOrNull(body.expiryDate);
    if (expiryDate === undefined) return { error: 'Expiry date must be a valid date (YYYY-MM-DD).' };
    if (expiryDate && expiryDate <= joinDate) return { error: 'Expiry date must be after the join date.' };

    const billingDate = dateOrNull(body.billingDate);
    if (billingDate === undefined) return { error: 'Billing date must be a valid date (YYYY-MM-DD).' };

    let creditFlag = strOrNull(body.creditFlag);
    if (creditFlag && !CREDIT_FLAG_KEYS.includes(creditFlag)) return { error: 'Invalid credit flag.' };

    const creditLimit = numOrNull(body.creditLimit);
    if (creditLimit !== null && (!Number.isFinite(creditLimit) || creditLimit < 0)) {
        return { error: 'Credit limit must be a non-negative number.' };
    }

    const terms = numOrNull(body.terms);
    if (terms !== null && (!Number.isInteger(terms) || terms < 0)) {
        return { error: 'Terms must be a whole number of days.' };
    }

    const statementMode = strOrNull(body.statementMode);
    if (statementMode && !STATEMENT_MODE_KEYS.includes(statementMode)) return { error: 'Invalid statement mode.' };

    const value = {
        joinDate,
        expiryDate,
        billingDate: membershipClass === 'corporate' ? billingDate : null,
        creditFlag: membershipClass === 'individual' ? creditFlag : null,
        creditLimit,
        terms,
        statementMode,
        sendReminders: !!body.sendReminders,
        chargeInterest: !!body.chargeInterest,
        monthlyFee: !!body.monthlyFee,
        yearlyFee: !!body.yearlyFee,
        certificateNo: strOrNull(body.certificateNo),
        applicationNo: strOrNull(body.applicationNo),
        reference: strOrNull(body.reference),
        proposer: strOrNull(body.proposer),
        salesCode: strOrNull(body.salesCode),
        followupSalesCode: strOrNull(body.followupSalesCode),
        remarks: strOrNull(body.remarks),
    };

    if (membershipClass === 'corporate') {
        const corporateName = strOrNull(body.corporateName);
        if (!corporateName) return { error: 'Company name is required for a corporate membership.' };
        Object.assign(value, {
            corporateName,
            registrationNo: strOrNull(body.registrationNo),
            taxNo: strOrNull(body.taxNo),
            contactPerson: strOrNull(body.contactPerson),
            contactDesignation: strOrNull(body.contactDesignation),
            phone: strOrNull(body.phone),
            fax: strOrNull(body.fax),
            mobile: strOrNull(body.mobile),
            email: strOrNull(body.email),
            industryTypeCode: strOrNull(body.industryTypeCode),
        });
    } else {
        Object.assign(value, {
            corporateName: null, registrationNo: null, taxNo: null,
            contactPerson: null, contactDesignation: null,
            phone: null, fax: null, mobile: null, email: null,
            industryTypeCode: null,
        });
    }

    return { value };
}

// The typed address book sent by the forms: an array of rows, at most one per
// addressType. Returns { value: [...] } or { error }. An absent/empty array is
// valid (the owner simply has no addresses on file).
function normalizeAddresses(raw) {
    if (raw === undefined || raw === null) return { value: [] };
    if (!Array.isArray(raw)) return { error: 'Addresses must be a list.' };
    const seen = new Set();
    const value = [];
    for (const row of raw) {
        const addressType = strOrNull(row && row.addressType);
        const address = strOrNull(row && row.address);
        // A row with no street line is treated as an intentionally empty entry.
        if (!address) continue;
        if (!addressType || !ADDRESS_TYPE_KEYS.includes(addressType)) {
            return { error: 'Each address needs a valid type (residential, mailing, company or other).' };
        }
        if (seen.has(addressType)) {
            const label = ADDRESS_TYPES.find((t) => t.key === addressType).label;
            return { error: `Only one ${label} address is allowed.` };
        }
        seen.add(addressType);
        if (address.length > 255) return { error: 'Address must be 255 characters or fewer.' };
        value.push({
            addressType,
            address,
            city: strOrNull(row.city),
            postcode: strOrNull(row.postcode),
            state: strOrNull(row.state),
            countryCode: (strOrNull(row.countryCode) || '').toLowerCase() || null,
        });
    }
    return { value };
}

// Replace an owner's address book wholesale inside `transaction` (the forms
// always send the full set).
async function replaceAddresses(owner, rows, companyId, stamps, transaction) {
    await Address.destroy({ where: owner, transaction });
    if (rows.length) {
        await Address.bulkCreate(rows.map((r) => ({ ...r, ...owner, companyId, ...stamps })), { transaction });
    }
}

// The address books for one membership + its members, keyed for DTO assembly.
async function loadAddressBooks(membershipId, memberIds) {
    const rows = await Address.findAll({
        where: {
            [Op.or]: [
                { membershipId },
                ...(memberIds.length ? [{ memberId: memberIds }] : []),
            ],
        },
        order: [['addressType', 'ASC']],
    });
    const toDto = (a) => ({
        addressType: a.addressType,
        address: a.address,
        city: a.city,
        postcode: a.postcode,
        state: a.state,
        countryCode: a.countryCode,
    });
    const forMembership = rows.filter((a) => a.membershipId).map(toDto);
    const byMember = new Map();
    for (const a of rows) {
        if (!a.memberId) continue;
        if (!byMember.has(a.memberId)) byMember.set(a.memberId, []);
        byMember.get(a.memberId).push(toDto(a));
    }
    return { forMembership, byMember };
}

// Person-profile fields shared by every member kind. Returns { value } or
// { error }.
function normalizeMemberProfile(body) {
    const lastName = strOrNull(body.lastName);
    if (!lastName) return { error: 'Last name is required.' };

    const gender = strOrNull(body.gender);
    if (gender && !GENDER_KEYS.includes(gender)) return { error: 'Invalid gender.' };

    const maritalStatus = strOrNull(body.maritalStatus);
    if (maritalStatus && !MARITAL_STATUS_KEYS.includes(maritalStatus)) return { error: 'Invalid marital status.' };

    for (const [label, v] of [['Birth date', body.birthDate], ['Marital date', body.maritalDate], ['Join date', body.joinDate], ['Expiry date', body.expiryDate]]) {
        if (dateOrNull(v) === undefined) return { error: `${label} must be a valid date (YYYY-MM-DD).` };
    }

    const creditLimit = numOrNull(body.creditLimit);
    if (creditLimit !== null && (!Number.isFinite(creditLimit) || creditLimit < 0)) {
        return { error: 'Credit limit must be a non-negative number.' };
    }

    // Photo: the public URL returned by POST /memberships/photo. http(s) only,
    // so a stored value can never inject markup.
    const photoUrl = strOrNull(body.photoUrl);
    if (photoUrl && (photoUrl.length > 500 || !/^https?:\/\//i.test(photoUrl))) {
        return { error: 'Photo URL must be an http(s) URL.' };
    }

    return {
        value: {
            photoUrl,
            salutationCode: strOrNull(body.salutationCode),
            titleCode: strOrNull(body.titleCode),
            firstName: strOrNull(body.firstName),
            middleName: strOrNull(body.middleName),
            lastName,
            nameOnCard: strOrNull(body.nameOnCard),
            localName: strOrNull(body.localName),
            gender,
            birthDate: dateOrNull(body.birthDate),
            identityNo: strOrNull(body.identityNo),
            nationalityCode: strOrNull(body.nationalityCode),
            raceCode: strOrNull(body.raceCode),
            maritalStatus,
            maritalDate: maritalStatus === 'married' ? dateOrNull(body.maritalDate) : null,
            phone: strOrNull(body.phone),
            mobile: strOrNull(body.mobile),
            fax: strOrNull(body.fax),
            email: strOrNull(body.email),
            employerName: strOrNull(body.employerName),
            designation: strOrNull(body.designation),
            industryTypeCode: strOrNull(body.industryTypeCode),
            joinDate: dateOrNull(body.joinDate),
            expiryDate: dateOrNull(body.expiryDate),
            creditLimit,
            remarks: strOrNull(body.remarks),
        },
    };
}

// POST /api/membership/memberships/photo (multipart, field "photo")
// Upload a member photo to GCS and return its public URL; the caller stores the
// URL on the member via the normal create/update (same shape as the golf-course
// photo and company/platform logo flows).
exports.uploadMemberPhoto = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        if (!req.file) return res.status(400).json({ message: 'No image file uploaded.' });
        if (!/^image\//.test(req.file.mimetype || '')) {
            return res.status(400).json({ message: 'The file must be an image.' });
        }

        const fileExtension = req.file.originalname.split('.').pop();
        const gcsFileName = `member-photo-${companyId}-${Date.now()}.${fileExtension}`;
        const blob = bucket.file(gcsFileName);
        await blob.save(req.file.buffer, { resumable: false, contentType: req.file.mimetype });
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
        res.status(200).json({ message: 'Photo uploaded.', url: publicUrl });
    } catch (error) {
        console.error('Member photo upload error:', error);
        res.status(500).json({ message: error.message || 'Failed to upload photo.' });
    }
};

// A status the caller references must belong to their company.
async function resolveStatus(companyId, statusId) {
    if (!statusId) return null;
    return MembershipStatus.findOne({ where: { id: statusId, companyId } });
}

// The next free '<parentNo>-X' letter suffix for a nominee/dependent number.
async function suggestChildNo(companyId, parentNo) {
    const existing = await Member.findAll({
        where: { companyId, memberNo: { [Op.like]: `${parentNo}-%` } },
        attributes: ['memberNo'],
    });
    const taken = new Set(existing.map((m) => m.memberNo.toUpperCase()));
    for (let i = 0; i < 26; i++) {
        const candidate = `${parentNo}-${String.fromCharCode(65 + i)}`;
        if (!taken.has(candidate.toUpperCase())) return candidate;
    }
    return `${parentNo}-${existing.length + 1}`;
}

async function memberNoInUse(companyId, memberNo, excludeId = null) {
    const where = { companyId, memberNo };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    const clash = await Member.findOne({ where, attributes: ['id'] });
    return !!clash;
}

function ownershipStamps(req, placement) {
    const callerId = getUserContext(req).userId;
    return {
        createdBy: callerId,
        createdByDepartmentId: placement.departmentId,
        updatedBy: callerId,
    };
}

// ---------------------------------------------------------------------------
// Meta & pickers

// GET /api/membership/memberships/meta - fixed vocabularies + numbering mode.
exports.getMeta = async (req, res) => {
    try {
        const numberingMode = await numberingGateway.getMode(req, NUMBERING_PURPOSE);
        res.status(200).json({
            memberKinds: MEMBER_KINDS,
            dependentTypes: DEPENDENT_TYPES,
            expiringDependentTypes: EXPIRING_DEPENDENT_TYPES,
            genders: GENDERS,
            maritalStatuses: MARITAL_STATUSES,
            creditFlags: CREDIT_FLAGS,
            statementModes: STATEMENT_MODES,
            addressTypes: ADDRESS_TYPES,
            // 'auto' (system issues on save) | 'manual' | null (no scheme -> manual).
            numberingMode,
        });
    } catch (error) {
        console.error('Error loading membership meta:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/membership/memberships/options - the master-file pickers the
// membership form needs, in one call (avoids cross-menu RBAC on the other
// masters' endpoints).
exports.getOptions = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const [types, statuses, fees] = await Promise.all([
            MembershipType.findAll({ where: { companyId, isActive: true }, order: [['category', 'ASC']] }),
            MembershipStatus.findAll({ where: { companyId, isActive: true }, order: [['membershipStatus', 'ASC']] }),
            MembershipFee.findAll({ where: { companyId, isActive: true }, order: [['membershipFeeCode', 'ASC']] }),
        ]);

        res.status(200).json({
            types: types.map((t) => ({
                id: t.id,
                category: t.category,
                description: t.description,
                membershipClass: t.membershipClass,
                noOfNominee: t.noOfNominee,
                nomineeCategoryId: t.nomineeCategoryId,
                defaultMembershipStatusId: t.defaultMembershipStatusId,
                defaultMembershipFeeId: t.defaultMembershipFeeId,
                isTermMembership: t.isTermMembership,
                termMonths: t.termMonths,
                creditLimit: t.creditLimit == null ? null : Number(t.creditLimit),
                childAgeFrom: t.childAgeFrom,
                childAgeTo: t.childAgeTo,
            })),
            statuses: statuses.map((s) => ({
                id: s.id,
                membershipStatus: s.membershipStatus,
                statusClass: s.statusClass,
                statusColor: s.statusColor,
            })),
            fees: fees.map((f) => ({
                id: f.id,
                membershipFeeCode: f.membershipFeeCode,
                description: f.description,
                amount: Number(f.amount),
            })),
        });
    } catch (error) {
        console.error('Error loading membership options:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// Memberships

// Slim row for the listing - the card needs identity + lookups + counts only;
// the full contract loads via GET /:id when a dialog opens. Keeps a page of 50
// rows a few KB instead of shipping every contract field for every record.
function toMembershipListDto(ms, extra = {}) {
    return {
        id: ms.id,
        membershipNo: ms.membershipNo,
        membershipClass: ms.membershipClass,
        membershipTypeId: ms.membershipTypeId,
        membershipStatusId: ms.membershipStatusId,
        joinDate: ms.joinDate,
        expiryDate: ms.expiryDate,
        ...extra,
    };
}

const LIST_LIMIT_DEFAULT = 50;
const LIST_LIMIT_MAX = 200;

// GET /api/membership/memberships?q=&class=&status=&limit=&offset= -
// SERVER-SIDE search + pagination (a club can hold tens of thousands of
// memberships - the browser never receives more than one page). `q` matches the
// membership number, the corporate name, or the individual member's name; the
// counts line comes from aggregates, and RBAC row flags are computed for the
// returned page only.
exports.listMemberships = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const where = { companyId };
        const cls = str(req.query.class);
        if (MEMBERSHIP_CLASS_KEYS.includes(cls)) where.membershipClass = cls;
        const statusId = strOrNull(req.query.status);
        if (statusId) where.membershipStatusId = statusId;

        const q = str(req.query.q);
        if (q) {
            const like = { [Op.iLike]: `%${q}%` };
            // Individual memberships are found by their PERSON's name too - via an
            // EXISTS probe on the member table (value escaped, trigram-indexable).
            const esc = sequelize.escape(`%${q}%`);
            where[Op.or] = [
                { membershipNo: like },
                { corporateName: like },
                sequelize.literal(
                    `EXISTS (SELECT 1 FROM membership."Member" mm WHERE mm."membershipId" = "Membership"."id" AND mm."memberKind" = 'individual' ` +
                    `AND (mm."firstName" ILIKE ${esc} OR mm."lastName" ILIKE ${esc} OR (coalesce(mm."firstName", '') || ' ' || mm."lastName") ILIKE ${esc}))`,
                ),
            ];
        }

        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || LIST_LIMIT_DEFAULT, 1), LIST_LIMIT_MAX);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

        const [total, classCounts, rows] = await Promise.all([
            Membership.count({ where }),
            // Overall class split for the header line - independent of filters.
            Membership.count({ where: { companyId }, group: ['membershipClass'] }),
            Membership.findAll({
                where,
                include: [{ model: Member, as: 'Members', attributes: ['id', 'memberKind', 'firstName', 'lastName'] }],
                order: [['membershipNo', 'ASC']],
                limit,
                offset,
            }),
        ]);

        const counts = { individual: 0, corporate: 0 };
        for (const c of classCounts) counts[c.membershipClass] = Number(c.count);

        const flags = await annotateCanModify(req, rows);
        res.status(200).json({
            total,
            limit,
            offset,
            counts,
            memberships: rows.map((ms, i) => {
                const members = ms.Members || [];
                const principal = members.find((m) => m.memberKind === 'individual');
                const displayName = ms.membershipClass === 'corporate'
                    ? ms.corporateName
                    : (principal ? [principal.firstName, principal.lastName].filter(Boolean).join(' ') : null);
                return toMembershipListDto(ms, {
                    canModify: flags[i],
                    displayName,
                    nomineeCount: members.filter((m) => m.memberKind === 'nominee').length,
                    dependentCount: members.filter((m) => m.memberKind === 'dependent').length,
                });
            }),
        });
    } catch (error) {
        console.error('Error listing memberships:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/membership/memberships/:id - one membership + its member tree.
exports.getMembership = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const ms = await Membership.findOne({ where: { id: req.params.id, companyId } });
        if (!ms) return res.status(404).json({ message: 'Membership not found.' });

        const members = await Member.findAll({ where: { membershipId: ms.id }, order: [['memberNo', 'ASC']] });
        const books = await loadAddressBooks(ms.id, members.map((m) => m.id));
        const canModify = await canModifyRecord(req, ms);
        res.status(200).json(toMembershipDto(ms, {
            canModify,
            addresses: books.forMembership,
            members: members.map((m) => toMemberDto(m, { addresses: books.byMember.get(m.id) || [] })),
        }));
    } catch (error) {
        console.error('Error loading membership:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/membership/memberships - create. Individual class requires a nested
// `member` profile object and auto-creates the Member row; corporate does not.
exports.createMembership = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        // 1. The type decides the class and the defaults.
        const type = await MembershipType.findOne({ where: { id: str(req.body.membershipTypeId), companyId } });
        if (!type) return res.status(400).json({ message: 'Membership type not found.' });
        if (!type.isActive) return res.status(400).json({ message: `Membership type '${type.category}' is disabled.` });
        const membershipClass = type.membershipClass;
        if (!MEMBERSHIP_CLASS_KEYS.includes(membershipClass)) {
            return res.status(400).json({ message: 'The membership type has an invalid class.' });
        }

        // 2. Contract fields.
        const parsed = normalizeMembershipBody(req.body, membershipClass);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        // 3. Status: explicit choice, else the type's default.
        const statusId = strOrNull(req.body.membershipStatusId) || type.defaultMembershipStatusId;
        if (!statusId) return res.status(400).json({ message: 'Select a membership status (the type has no default status).' });
        const status = await resolveStatus(companyId, statusId);
        if (!status) return res.status(400).json({ message: 'Membership status not found.' });

        // 4. Fee: explicit choice, else the type's default. Optional.
        let membershipFeeId = strOrNull(req.body.membershipFeeId) || type.defaultMembershipFeeId || null;
        if (membershipFeeId) {
            const fee = await MembershipFee.findOne({ where: { id: membershipFeeId, companyId }, attributes: ['id'] });
            if (!fee) return res.status(400).json({ message: 'Membership fee not found.' });
        }
        if (v.creditLimit === null && type.creditLimit != null) v.creditLimit = Number(type.creditLimit);
        // Term membership: default the contract expiry from the type's term when
        // the caller sent none (the form pre-fills the same value, editable).
        if (!v.expiryDate && type.isTermMembership && type.termMonths) {
            v.expiryDate = defaultTermExpiry(v.joinDate, type.termMonths);
        }

        // 5. The individual profile (individual class only).
        let profile = null;
        if (membershipClass === 'individual') {
            const parsedProfile = normalizeMemberProfile(req.body.member || {});
            if (parsedProfile.error) return res.status(400).json({ message: parsedProfile.error });
            profile = parsedProfile.value;
        }

        // 5b. The typed address books: contract addresses for corporate, the
        // individual member's own addresses nested in the profile payload.
        const contractAddrs = normalizeAddresses(membershipClass === 'corporate' ? req.body.addresses : []);
        if (contractAddrs.error) return res.status(400).json({ message: contractAddrs.error });
        const memberAddrs = normalizeAddresses(membershipClass === 'individual' ? (req.body.member || {}).addresses : []);
        if (memberAddrs.error) return res.status(400).json({ message: memberAddrs.error });

        // 6. The membership number - Numbering Control decides.
        let membershipNo = strOrNull(req.body.membershipNo);
        let issued = null;
        const mode = await numberingGateway.getMode(req, NUMBERING_PURPOSE);
        if (mode === 'auto') {
            issued = await numberingGateway.issueNumber(req, NUMBERING_PURPOSE, { typeCode: type.category });
            if (issued && issued.number) membershipNo = issued.number;
        }
        if (!membershipNo) {
            return res.status(400).json({ message: 'Membership number is required (no auto-numbering scheme is active).' });
        }
        const clash = await Membership.findOne({ where: { companyId, membershipNo }, attributes: ['id'] });
        if (clash) return res.status(409).json({ message: `Membership number '${membershipNo}' is already in use.` });
        if (await memberNoInUse(companyId, membershipNo)) {
            return res.status(409).json({ message: `Member number '${membershipNo}' is already in use.` });
        }

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);
        const callerId = getUserContext(req).userId;
        // The club identity for the welcome email (name + owning accountId for
        // the subscriber's template override), read through the seam.
        const company = await getActiveCompany(req);

        const created = await sequelize.transaction(async (t) => {
            const ms = await Membership.create({
                companyId,
                membershipNo,
                membershipClass,
                membershipTypeId: type.id,
                membershipStatusId: status.id,
                statusDate: todayStr(),
                membershipFeeId,
                approvalStatus: 'approved',
                approvedAt: new Date(),
                approvedBy: callerId,
                ...v,
                ...stamps,
            }, { transaction: t });
            await replaceAddresses({ membershipId: ms.id }, contractAddrs.value, companyId, stamps, t);

            // The individual member is born with the membership; the member number
            // IS the membership number, the person's status mirrors the contract's.
            let individualMember = null;
            if (membershipClass === 'individual') {
                individualMember = await Member.create({
                    companyId,
                    membershipId: ms.id,
                    memberNo: membershipNo,
                    memberKind: 'individual',
                    dependentType: null,
                    principalMemberId: null,
                    memberStatusId: status.id,
                    statusDate: todayStr(),
                    ...profile,
                    joinDate: profile.joinDate || v.joinDate,
                    ...stamps,
                }, { transaction: t });
                await replaceAddresses({ memberId: individualMember.id }, memberAddrs.value, companyId, stamps, t);
            }

            // Welcome email - only when the membership needs no approval (the
            // approval seam is always 'approved' today; a future approval workflow
            // must send this at approval time instead, since pending creates skip
            // this branch). Recipient: the individual member's email, else the
            // corporate contact email; nobody on file -> no email. Non-critical:
            // a template problem must not block the creation (renderEmail's reads
            // run off-transaction, so a caught failure cannot poison this tx).
            if (ms.approvalStatus === 'approved') {
                const to = membershipClass === 'individual' ? profile.email : v.email;
                if (to) {
                    try {
                        // Portal self-registration link - only when the recipient IS
                        // the member (individual class; a corporate contact is not a
                        // member). Signed stateless token, so nothing extra is stored.
                        const portalRegisterLink = individualMember
                            ? `${FRONTEND_BASE_URL}/portal/register?token=${signRegistrationToken(individualMember)}`
                            : null;
                        await enqueueEmail({
                            templateKey: 'membership.welcome',
                            accountId: company ? company.accountId : null,
                            companyId,
                            to,
                            data: {
                                email: to,
                                memberName: membershipClass === 'individual'
                                    ? [profile.firstName, profile.lastName].filter(Boolean).join(' ')
                                    : (v.contactPerson || v.corporateName),
                                membershipNo,
                                membershipTypeName: type.category,
                                companyName: company ? company.name : null,
                                joinDate: v.joinDate,
                                portalRegisterLink,
                            },
                        }, t);
                    } catch (err) {
                        console.error(`Welcome email for membership ${membershipNo} not queued:`, err.message);
                    }
                }
            }
            return ms;
        });

        const members = await Member.findAll({ where: { membershipId: created.id }, order: [['memberNo', 'ASC']] });
        const books = await loadAddressBooks(created.id, members.map((m) => m.id));
        res.status(201).json({
            message: `Membership ${membershipNo} created.`,
            membership: toMembershipDto(created, {
                canModify: true,
                addresses: books.forMembership,
                members: members.map((m) => toMemberDto(m, { addresses: books.byMember.get(m.id) || [] })),
            }),
        });
    } catch (error) {
        console.error('Error creating membership:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/membership/memberships/:id - update the contract. The number, class
// and type are immutable here (ID/category conversion are Phase 3 functions).
// A status change syncs the individual member's own status (individual class).
exports.updateMembership = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const ms = await Membership.findOne({ where: { id: req.params.id, companyId } });
        if (!ms) return res.status(404).json({ message: 'Membership not found.' });
        if (!(await canModifyRecord(req, ms))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        const parsed = normalizeMembershipBody(req.body, ms.membershipClass);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        const statusId = strOrNull(req.body.membershipStatusId) || ms.membershipStatusId;
        const statusChanged = statusId !== ms.membershipStatusId;
        if (statusChanged) {
            const status = await resolveStatus(companyId, statusId);
            if (!status) return res.status(400).json({ message: 'Membership status not found.' });
        }

        let membershipFeeId = strOrNull(req.body.membershipFeeId) || null;
        if (membershipFeeId && membershipFeeId !== ms.membershipFeeId) {
            const fee = await MembershipFee.findOne({ where: { id: membershipFeeId, companyId }, attributes: ['id'] });
            if (!fee) return res.status(400).json({ message: 'Membership fee not found.' });
        }

        // Contract addresses (corporate class edits the contract's book).
        const contractAddrs = normalizeAddresses(ms.membershipClass === 'corporate' ? req.body.addresses : []);
        if (contractAddrs.error) return res.status(400).json({ message: contractAddrs.error });

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);

        await sequelize.transaction(async (t) => {
            Object.assign(ms, v);
            ms.membershipFeeId = membershipFeeId;
            if (statusChanged) {
                ms.membershipStatusId = statusId;
                ms.statusDate = todayStr();
            }
            ms.updatedBy = getUserContext(req).userId;
            await ms.save({ transaction: t });
            if (ms.membershipClass === 'corporate') {
                await replaceAddresses({ membershipId: ms.id }, contractAddrs.value, companyId, stamps, t);
            }

            // Individual class: the person's own status follows the contract.
            if (statusChanged && ms.membershipClass === 'individual') {
                await Member.update(
                    { memberStatusId: statusId, statusDate: todayStr(), updatedBy: ms.updatedBy },
                    { where: { membershipId: ms.id, memberKind: 'individual' }, transaction: t },
                );
            }
        });

        const members = await Member.findAll({ where: { membershipId: ms.id }, order: [['memberNo', 'ASC']] });
        const books = await loadAddressBooks(ms.id, members.map((m) => m.id));
        res.status(200).json({
            message: `Membership ${ms.membershipNo} updated.`,
            membership: toMembershipDto(ms, {
                canModify: true,
                addresses: books.forMembership,
                members: members.map((m) => toMemberDto(m, { addresses: books.byMember.get(m.id) || [] })),
            }),
        });
    } catch (error) {
        console.error('Error updating membership:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// Members under a membership (nominees + dependents + profile edits)

// GET /api/membership/memberships/:id/members/suggest-no?parentNo= - the next
// free child number for the Add-nominee / Add-dependent forms.
exports.suggestMemberNo = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const parentNo = strOrNull(req.query.parentNo);
        if (!parentNo) return res.status(400).json({ message: 'parentNo is required.' });
        res.status(200).json({ memberNo: await suggestChildNo(companyId, parentNo) });
    } catch (error) {
        console.error('Error suggesting member number:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/membership/memberships/:id/members - add a NOMINEE to a corporate
// membership (individual members are auto-created; dependents have their own
// endpoint below).
exports.createNominee = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const ms = await Membership.findOne({ where: { id: req.params.id, companyId } });
        if (!ms) return res.status(404).json({ message: 'Membership not found.' });
        if (ms.membershipClass !== 'corporate') {
            return res.status(400).json({ message: 'Nominees can only be added to a corporate membership.' });
        }
        if (!(await canModifyRecord(req, ms))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        // The type's noOfNominee caps the seats.
        const type = await MembershipType.findOne({ where: { id: ms.membershipTypeId, companyId } });
        if (type && type.noOfNominee != null) {
            const current = await Member.count({ where: { membershipId: ms.id, memberKind: 'nominee' } });
            if (current >= type.noOfNominee) {
                return res.status(400).json({ message: `This membership allows at most ${type.noOfNominee} nominee(s).` });
            }
        }

        const parsedProfile = normalizeMemberProfile(req.body);
        if (parsedProfile.error) return res.status(400).json({ message: parsedProfile.error });
        const profile = parsedProfile.value;
        const addrs = normalizeAddresses(req.body.addresses);
        if (addrs.error) return res.status(400).json({ message: addrs.error });

        const statusId = strOrNull(req.body.memberStatusId) || ms.membershipStatusId;
        const status = await resolveStatus(companyId, statusId);
        if (!status) return res.status(400).json({ message: 'Member status not found.' });

        let memberNo = strOrNull(req.body.memberNo) || await suggestChildNo(companyId, ms.membershipNo);
        if (await memberNoInUse(companyId, memberNo)) {
            return res.status(409).json({ message: `Member number '${memberNo}' is already in use.` });
        }

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);
        const member = await sequelize.transaction(async (t) => {
            const created = await Member.create({
                companyId,
                membershipId: ms.id,
                memberNo,
                memberKind: 'nominee',
                dependentType: null,
                principalMemberId: null,
                memberStatusId: status.id,
                statusDate: todayStr(),
                ...profile,
                joinDate: profile.joinDate || todayStr(),
                ...stamps,
            }, { transaction: t });
            await replaceAddresses({ memberId: created.id }, addrs.value, companyId, stamps, t);
            return created;
        });

        res.status(201).json({ message: `Nominee ${memberNo} added.`, member: toMemberDto(member, { addresses: addrs.value }) });
    } catch (error) {
        console.error('Error creating nominee:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/membership/memberships/:id/members/:memberId/dependents - add a
// dependent under an individual member or a nominee of this membership.
exports.createDependent = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const ms = await Membership.findOne({ where: { id: req.params.id, companyId } });
        if (!ms) return res.status(404).json({ message: 'Membership not found.' });
        if (!(await canModifyRecord(req, ms))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        const principal = await Member.findOne({ where: { id: req.params.memberId, membershipId: ms.id } });
        if (!principal) return res.status(404).json({ message: 'Member not found on this membership.' });
        if (principal.memberKind === 'dependent') {
            return res.status(400).json({ message: 'A dependent cannot have dependents of their own.' });
        }

        const dependentType = strOrNull(req.body.dependentType);
        if (!DEPENDENT_TYPE_KEYS.includes(dependentType)) {
            return res.status(400).json({ message: 'Select the dependent type (spouse, son, daughter or ward).' });
        }

        const parsedProfile = normalizeMemberProfile(req.body);
        if (parsedProfile.error) return res.status(400).json({ message: parsedProfile.error });
        const profile = parsedProfile.value;
        // Only children/wards age out; a spouse never carries an expiry date.
        if (!EXPIRING_DEPENDENT_TYPES.includes(dependentType)) profile.expiryDate = null;
        const addrs = normalizeAddresses(req.body.addresses);
        if (addrs.error) return res.status(400).json({ message: addrs.error });

        const statusId = strOrNull(req.body.memberStatusId) || principal.memberStatusId;
        const status = await resolveStatus(companyId, statusId);
        if (!status) return res.status(400).json({ message: 'Member status not found.' });

        let memberNo = strOrNull(req.body.memberNo) || await suggestChildNo(companyId, principal.memberNo);
        if (await memberNoInUse(companyId, memberNo)) {
            return res.status(409).json({ message: `Member number '${memberNo}' is already in use.` });
        }

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);
        const member = await sequelize.transaction(async (t) => {
            const created = await Member.create({
                companyId,
                membershipId: ms.id,
                memberNo,
                memberKind: 'dependent',
                dependentType,
                principalMemberId: principal.id,
                memberStatusId: status.id,
                statusDate: todayStr(),
                ...profile,
                joinDate: profile.joinDate || todayStr(),
                ...stamps,
            }, { transaction: t });
            await replaceAddresses({ memberId: created.id }, addrs.value, companyId, stamps, t);
            return created;
        });

        res.status(201).json({ message: `Dependent ${memberNo} added.`, member: toMemberDto(member, { addresses: addrs.value }) });
    } catch (error) {
        console.error('Error creating dependent:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/membership/memberships/:id/members/:memberId - edit a member's
// profile. The member number and kind are immutable here (ID conversion is a
// Phase 3 function). An individual member's status change syncs the contract.
exports.updateMember = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const ms = await Membership.findOne({ where: { id: req.params.id, companyId } });
        if (!ms) return res.status(404).json({ message: 'Membership not found.' });
        if (!(await canModifyRecord(req, ms))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        const member = await Member.findOne({ where: { id: req.params.memberId, membershipId: ms.id } });
        if (!member) return res.status(404).json({ message: 'Member not found on this membership.' });

        const parsedProfile = normalizeMemberProfile(req.body);
        if (parsedProfile.error) return res.status(400).json({ message: parsedProfile.error });
        const profile = parsedProfile.value;
        const addrs = normalizeAddresses(req.body.addresses);
        if (addrs.error) return res.status(400).json({ message: addrs.error });

        if (member.memberKind === 'dependent') {
            const dependentType = strOrNull(req.body.dependentType) || member.dependentType;
            if (!DEPENDENT_TYPE_KEYS.includes(dependentType)) return res.status(400).json({ message: 'Invalid dependent type.' });
            member.dependentType = dependentType;
            if (!EXPIRING_DEPENDENT_TYPES.includes(dependentType)) profile.expiryDate = null;
        }

        const statusId = strOrNull(req.body.memberStatusId) || member.memberStatusId;
        const statusChanged = statusId !== member.memberStatusId;
        if (statusChanged) {
            const status = await resolveStatus(companyId, statusId);
            if (!status) return res.status(400).json({ message: 'Member status not found.' });
        }

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);
        await sequelize.transaction(async (t) => {
            Object.assign(member, profile);
            if (statusChanged) {
                member.memberStatusId = statusId;
                member.statusDate = todayStr();
            }
            member.updatedBy = getUserContext(req).userId;
            await member.save({ transaction: t });
            await replaceAddresses({ memberId: member.id }, addrs.value, companyId, stamps, t);

            // Individual class: the contract status follows the person.
            if (statusChanged && member.memberKind === 'individual') {
                ms.membershipStatusId = statusId;
                ms.statusDate = todayStr();
                ms.updatedBy = member.updatedBy;
                await ms.save({ transaction: t });
            }
        });

        res.status(200).json({ message: `Member ${member.memberNo} updated.`, member: toMemberDto(member, { addresses: addrs.value }) });
    } catch (error) {
        console.error('Error updating member:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
