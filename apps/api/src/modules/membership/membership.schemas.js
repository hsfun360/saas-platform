// Request schemas for the Memberships (CRM) routes and the module-level
// debtor utilities (the Zod boundary seam, platform/validate.js - mounted
// 2026-10-12). The controller keeps every business check (class-conditional
// fields, vocabularies, date order, numbering mode, sales-agent ownership);
// these schemas bound SHAPE and SIZE and strip unknown keys, so every key the
// controller or its normalisers read is listed here - an unlisted key would be
// silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Amounts, counts and paging arrive as numbers or digit strings from the web forms.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

// One row of a typed address book (normalizeAddresses). The controller owns
// the per-type vocabulary and the one-row-per-type rule.
const addressLine = z.object({
    addressType: str(20),
    address: str(1000),
    city: str(100),
    postcode: str(20),
    state: str(100),
    countryCode: str(10),
});
const addresses = z.array(addressLine).max(10).nullable().optional();

// Contract-level fields (normalizeMembershipBody) - shared by create and update.
const contract = {
    joinDate: str(10),
    expiryDate: str(10),
    billingDate: str(10),
    creditFlag: str(20),
    creditLimit: numberish,
    terms: numberish,
    statementMode: str(20),
    sendReminders: z.boolean().optional(),
    chargeInterest: z.boolean().optional(),
    monthlyFee: z.boolean().optional(),
    yearlyFee: z.boolean().optional(),
    certificateNo: str(50),
    applicationNo: str(50),
    reference: str(100),
    proposer: str(150),
    salesAgentId: str(64),
    followupSalesAgentId: str(64),
    remarks: str(2000),
    // Corporate profile (ignored for the individual class by the controller).
    corporateName: str(255),
    registrationNo: str(50),
    taxNo: str(50),
    contactPerson: str(150),
    contactDesignation: str(100),
    phone: str(30),
    fax: str(30),
    mobile: str(30),
    email: str(255),
    industryTypeCode: str(20),
    // Lookups resolved against the company's masters.
    membershipStatusId: str(64),
    membershipFeeId: str(64),
    addresses,
};

// Person-profile fields shared by every member kind (normalizeMemberProfile).
const profile = {
    photoUrl: str(1000),
    salutationCode: str(20),
    titleCode: str(20),
    firstName: str(100),
    middleName: str(100),
    lastName: str(100),
    nameOnCard: str(150),
    localName: str(150),
    gender: str(20),
    birthDate: str(10),
    identityNo: str(50),
    nationalityCode: str(10),
    raceCode: str(20),
    maritalStatus: str(20),
    maritalDate: str(10),
    phone: str(30),
    mobile: str(30),
    fax: str(30),
    email: str(255),
    employerName: str(150),
    designation: str(100),
    industryTypeCode: str(20),
    joinDate: str(10),
    expiryDate: str(10),
    creditLimit: numberish,
    remarks: str(2000),
    addresses,
};

// A nominee / dependent payload: the profile plus the member-level keys.
const memberBody = {
    ...profile,
    memberNo: str(30),
    memberStatusId: str(64),
    dependentType: str(20),
};

const idParam = { params: z.object({ id }) };
const memberParams = { params: z.object({ id, memberId: id }) };

module.exports = {
    id: idParam,
    list: {
        query: z.object({
            q: str(200),
            class: str(20),
            status: str(64),
            limit: numberish,
            offset: numberish,
            sort: str(20),
            dir: str(4),
        }),
    },
    arCredit: { ...idParam, query: z.object({ memberId: str(64) }) },
    // Create carries the type (decides the class), the optional manual number
    // and, for the individual class, the nested person profile.
    create: {
        body: z.object({
            ...contract,
            membershipTypeId: str(64),
            membershipNo: str(30),
            member: z.object(profile).nullable().optional(),
        }),
    },
    update: { ...idParam, body: z.object(contract) },
    suggestMemberNo: { ...idParam, query: z.object({ parentNo: str(30) }) },
    createNominee: { ...idParam, body: z.object(memberBody) },
    createDependent: { ...memberParams, body: z.object(memberBody) },
    updateMember: { ...memberParams, body: z.object(memberBody) },
};
