// Request schemas for the Debtor Listing + Other Debtor routes (the Zod
// boundary seam, platform/validate.js - mounted 2026-10-12). The controllers
// keep every business check (terms range, status vocabulary, credit-limit
// ownership, numbering mode, currency gate + lock); these schemas bound SHAPE
// and SIZE and strip unknown keys, so every key the controllers or their
// helpers read is listed here - an unlisted key would be silently dropped.
//
// Presence matters on the PATCH doors ('terms' in req.body, 'isActive' in
// req.body): Zod keeps an absent optional key absent and a null value null,
// so those checks keep working after the parse.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Days / amounts arrive as numbers or digit strings from the web forms ('' = clear).
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

// The ledger-account fields the Debtor Listing's edit dialog maintains (and
// the Other Debtor create dialog seeds).
const account = {
    terms: numberish,
    creditLimit: numberish,
    sendReminders: z.boolean().optional(),
    chargeInterest: z.boolean().optional(),
};

// The Other Debtor party profile (otherDebtor.controller normalizeProfile);
// countryCode is alpha-2 and currencyCode alpha-3 - the controller gives the
// friendlier message, the bound here just stops a pathological value.
const profile = {
    name: str(255),
    registrationNo: str(255),
    taxNo: str(255),
    contactPerson: str(255),
    phone: str(255),
    mobile: str(255),
    fax: str(255),
    email: str(255),
    address1: str(255),
    address2: str(255),
    address3: str(255),
    city: str(255),
    state: str(255),
    postcode: str(20),
    countryCode: str(8),
    remarks: str(4000),
    currencyCode: str(8),
};

const idParam = { params: z.object({ id }) };

module.exports = {
    id: idParam,
    // GET /debtors and GET /debtor-options share listDebtors (?q=&type=&status=&currency=&offset=&sort=&dir=).
    list: {
        query: z.object({
            q: str(200),
            type: str(20),
            status: str(20),
            currency: str(8),
            offset: numberish,
            sort: str(30),
            dir: str(8),
        }),
    },
    updateDebtor: { ...idParam, body: z.object({ ...account, status: str(20) }) },
    reconcile: { body: z.object({ fix: z.boolean().optional() }) },
    // Other Debtor: code is keyed at create (manual mode) and immutable after.
    createOtherDebtor: { body: z.object({ ...profile, ...account, code: str(30) }) },
    updateOtherDebtor: { ...idParam, body: z.object({ ...profile, isActive: z.boolean().optional() }) },
};
