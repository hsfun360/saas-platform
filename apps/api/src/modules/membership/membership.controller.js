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
    MEMBER_MAILING_SOURCES,
    MEMBER_MAILING_SOURCE_KEYS,
    MEMBERSHIP_MAILING_SOURCES,
    MEMBERSHIP_MAILING_SOURCE_KEYS,
} = require('./member.constants');
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
        residentAddress: m.residentAddress,
        residentPostcode: m.residentPostcode,
        residentState: m.residentState,
        residentCountryCode: m.residentCountryCode,
        mailingSource: m.mailingSource,
        mailingAddress: m.mailingAddress,
        mailingPostcode: m.mailingPostcode,
        mailingState: m.mailingState,
        mailingCountryCode: m.mailingCountryCode,
        joinDate: m.joinDate,
        expiryDate: m.expiryDate,
        creditLimit: m.creditLimit == null ? null : Number(m.creditLimit),
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
        address: ms.address,
        postcode: ms.postcode,
        state: ms.state,
        countryCode: ms.countryCode,
        mailingSource: ms.mailingSource,
        mailingAddress: ms.mailingAddress,
        mailingPostcode: ms.mailingPostcode,
        mailingState: ms.mailingState,
        mailingCountryCode: ms.mailingCountryCode,
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

    const mailingSource = strOrNull(body.mailingSource);
    if (mailingSource && !MEMBERSHIP_MAILING_SOURCE_KEYS.includes(mailingSource)) {
        return { error: 'Invalid mailing address option.' };
    }

    const value = {
        joinDate,
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
        mailingSource,
        mailingAddress: mailingSource === 'other' ? strOrNull(body.mailingAddress) : null,
        mailingPostcode: mailingSource === 'other' ? strOrNull(body.mailingPostcode) : null,
        mailingState: mailingSource === 'other' ? strOrNull(body.mailingState) : null,
        mailingCountryCode: mailingSource === 'other' ? (strOrNull(body.mailingCountryCode) || '').toLowerCase() || null : null,
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
            address: strOrNull(body.address),
            postcode: strOrNull(body.postcode),
            state: strOrNull(body.state),
            countryCode: (strOrNull(body.countryCode) || '').toLowerCase() || null,
        });
    } else {
        Object.assign(value, {
            corporateName: null, registrationNo: null, taxNo: null,
            contactPerson: null, contactDesignation: null,
            phone: null, fax: null, mobile: null, email: null,
            industryTypeCode: null, address: null, postcode: null, state: null, countryCode: null,
        });
    }

    return { value };
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

    const mailingSource = strOrNull(body.mailingSource);
    if (mailingSource && !MEMBER_MAILING_SOURCE_KEYS.includes(mailingSource)) {
        return { error: 'Invalid mailing address option.' };
    }

    for (const [label, v] of [['Birth date', body.birthDate], ['Marital date', body.maritalDate], ['Join date', body.joinDate], ['Expiry date', body.expiryDate]]) {
        if (dateOrNull(v) === undefined) return { error: `${label} must be a valid date (YYYY-MM-DD).` };
    }

    const creditLimit = numOrNull(body.creditLimit);
    if (creditLimit !== null && (!Number.isFinite(creditLimit) || creditLimit < 0)) {
        return { error: 'Credit limit must be a non-negative number.' };
    }

    return {
        value: {
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
            residentAddress: strOrNull(body.residentAddress),
            residentPostcode: strOrNull(body.residentPostcode),
            residentState: strOrNull(body.residentState),
            residentCountryCode: (strOrNull(body.residentCountryCode) || '').toLowerCase() || null,
            mailingSource,
            mailingAddress: mailingSource === 'other' ? strOrNull(body.mailingAddress) : null,
            mailingPostcode: mailingSource === 'other' ? strOrNull(body.mailingPostcode) : null,
            mailingState: mailingSource === 'other' ? strOrNull(body.mailingState) : null,
            mailingCountryCode: mailingSource === 'other' ? (strOrNull(body.mailingCountryCode) || '').toLowerCase() || null : null,
            joinDate: dateOrNull(body.joinDate),
            expiryDate: dateOrNull(body.expiryDate),
            creditLimit,
            remarks: strOrNull(body.remarks),
        },
    };
}

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
            memberMailingSources: MEMBER_MAILING_SOURCES,
            membershipMailingSources: MEMBERSHIP_MAILING_SOURCES,
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
        const canModify = await canModifyRecord(req, ms);
        res.status(200).json(toMembershipDto(ms, {
            canModify,
            members: members.map((m) => toMemberDto(m)),
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

        // 5. The individual profile (individual class only).
        let profile = null;
        if (membershipClass === 'individual') {
            const parsedProfile = normalizeMemberProfile(req.body.member || {});
            if (parsedProfile.error) return res.status(400).json({ message: parsedProfile.error });
            profile = parsedProfile.value;
        }

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

            // The individual member is born with the membership; the member number
            // IS the membership number, the person's status mirrors the contract's.
            if (membershipClass === 'individual') {
                await Member.create({
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
        res.status(201).json({
            message: `Membership ${membershipNo} created.`,
            membership: toMembershipDto(created, { canModify: true, members: members.map((m) => toMemberDto(m)) }),
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

        await sequelize.transaction(async (t) => {
            Object.assign(ms, v);
            ms.membershipFeeId = membershipFeeId;
            if (statusChanged) {
                ms.membershipStatusId = statusId;
                ms.statusDate = todayStr();
            }
            ms.updatedBy = getUserContext(req).userId;
            await ms.save({ transaction: t });

            // Individual class: the person's own status follows the contract.
            if (statusChanged && ms.membershipClass === 'individual') {
                await Member.update(
                    { memberStatusId: statusId, statusDate: todayStr(), updatedBy: ms.updatedBy },
                    { where: { membershipId: ms.id, memberKind: 'individual' }, transaction: t },
                );
            }
        });

        const members = await Member.findAll({ where: { membershipId: ms.id }, order: [['memberNo', 'ASC']] });
        res.status(200).json({
            message: `Membership ${ms.membershipNo} updated.`,
            membership: toMembershipDto(ms, { canModify: true, members: members.map((m) => toMemberDto(m)) }),
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

        const statusId = strOrNull(req.body.memberStatusId) || ms.membershipStatusId;
        const status = await resolveStatus(companyId, statusId);
        if (!status) return res.status(400).json({ message: 'Member status not found.' });

        let memberNo = strOrNull(req.body.memberNo) || await suggestChildNo(companyId, ms.membershipNo);
        if (await memberNoInUse(companyId, memberNo)) {
            return res.status(409).json({ message: `Member number '${memberNo}' is already in use.` });
        }

        const placement = await getCallerPlacement(req);
        const member = await Member.create({
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
            ...ownershipStamps(req, placement),
        });

        res.status(201).json({ message: `Nominee ${memberNo} added.`, member: toMemberDto(member) });
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

        const statusId = strOrNull(req.body.memberStatusId) || principal.memberStatusId;
        const status = await resolveStatus(companyId, statusId);
        if (!status) return res.status(400).json({ message: 'Member status not found.' });

        let memberNo = strOrNull(req.body.memberNo) || await suggestChildNo(companyId, principal.memberNo);
        if (await memberNoInUse(companyId, memberNo)) {
            return res.status(409).json({ message: `Member number '${memberNo}' is already in use.` });
        }

        const placement = await getCallerPlacement(req);
        const member = await Member.create({
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
            ...ownershipStamps(req, placement),
        });

        res.status(201).json({ message: `Dependent ${memberNo} added.`, member: toMemberDto(member) });
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

        await sequelize.transaction(async (t) => {
            Object.assign(member, profile);
            if (statusChanged) {
                member.memberStatusId = statusId;
                member.statusDate = todayStr();
            }
            member.updatedBy = getUserContext(req).userId;
            await member.save({ transaction: t });

            // Individual class: the contract status follows the person.
            if (statusChanged && member.memberKind === 'individual') {
                ms.membershipStatusId = statusId;
                ms.statusDate = todayStr();
                ms.updatedBy = member.updatedBy;
                await ms.save({ transaction: t });
            }
        });

        res.status(200).json({ message: `Member ${member.memberNo} updated.`, member: toMemberDto(member) });
    } catch (error) {
        console.error('Error updating member:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
