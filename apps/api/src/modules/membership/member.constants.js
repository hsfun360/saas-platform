// Fixed domain vocabularies for the Membership / Member CRM (SRS 2.3).
//
// Same discipline as membershipStatus.constants.js: values are stored as their
// stable `key`, the API validates against these lists AND serves them to the
// screens via GET /api/membership/memberships/meta, so UI and validation never
// drift.

// The three kinds of person a Member row can be (user-defined domain model):
//   Membership(individual) -> Member(individual) -> Dependents
//   Membership(corporate)  -> Member(nominee)    -> Dependents
const MEMBER_KINDS = [
    { key: 'individual', label: 'Individual Member' },
    { key: 'nominee', label: 'Nominee' },
    { key: 'dependent', label: 'Dependent' },
];

// Relationship of a dependent to its principal (individual member or nominee).
const DEPENDENT_TYPES = [
    { key: 'spouse', label: 'Spouse' },
    { key: 'son', label: 'Son' },
    { key: 'daughter', label: 'Daughter' },
    { key: 'ward', label: 'Ward' },
];

// Dependent types that carry an expiry date (children age out; spouses do not).
const EXPIRING_DEPENDENT_TYPES = ['son', 'daughter', 'ward'];

const GENDERS = [
    { key: 'male', label: 'Male' },
    { key: 'female', label: 'Female' },
];

const MARITAL_STATUSES = [
    { key: 'single', label: 'Single' },
    { key: 'married', label: 'Married' },
    { key: 'divorced', label: 'Divorced' },
    { key: 'widowed', label: 'Widowed' },
];

// Whose ledger a credit limit guards (individual-class memberships).
const CREDIT_FLAGS = [
    { key: 'personal', label: 'Personal - limit per person' },
    { key: 'combined', label: 'Combined - one limit for the membership' },
];

// How monthly statements are produced for the membership.
const STATEMENT_MODES = [
    { key: 'individual', label: 'Individual - one statement per person' },
    { key: 'combined', label: 'Combined - one statement for the membership' },
];

// Typed address book (membership."Address") - at most one row per (owner,
// type). Mail resolution: the 'mailing' row wins, else 'residential' (member)
// / 'company' (contract). Replaces the legacy mailingSource columns.
const ADDRESS_TYPES = [
    { key: 'residential', label: 'Residential' },
    { key: 'mailing', label: 'Mailing' },
    { key: 'company', label: 'Company' },
    { key: 'other', label: 'Other' },
];

// Workflow seam: memberships are effective immediately today; the planned
// workflow module will create them 'pending' and flip to 'approved'.
const APPROVAL_STATUSES = [
    { key: 'pending', label: 'Pending approval' },
    { key: 'approved', label: 'Approved' },
];

const MEMBER_KIND_KEYS = MEMBER_KINDS.map((k) => k.key);
const DEPENDENT_TYPE_KEYS = DEPENDENT_TYPES.map((k) => k.key);
const GENDER_KEYS = GENDERS.map((k) => k.key);
const MARITAL_STATUS_KEYS = MARITAL_STATUSES.map((k) => k.key);
const CREDIT_FLAG_KEYS = CREDIT_FLAGS.map((k) => k.key);
const STATEMENT_MODE_KEYS = STATEMENT_MODES.map((k) => k.key);
const ADDRESS_TYPE_KEYS = ADDRESS_TYPES.map((k) => k.key);
const APPROVAL_STATUS_KEYS = APPROVAL_STATUSES.map((k) => k.key);

module.exports = {
    MEMBER_KINDS,
    MEMBER_KIND_KEYS,
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
    APPROVAL_STATUSES,
    APPROVAL_STATUS_KEYS,
};
