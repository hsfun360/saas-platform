// Shared enums for the Tax service (templates + subscriber-owned schemes).
//
// Kept as string keys validated in the models (not Postgres ENUM types), matching
// the membershipStatus.constants convention: adding a value is a code change, not a
// fragile `ALTER TYPE`. The web app fetches these via a meta endpoint to build its
// dropdowns, so the labels live here too.

// Whether the scheme's rate is already baked into the price (INCLUSIVE) or added on
// top at billing time (EXCLUSIVE). Drives how each consuming system computes tax.
const IE_FLAGS = {
    INCLUSIVE: 'INCLUSIVE',
    EXCLUSIVE: 'EXCLUSIVE',
};
const IE_FLAG_KEYS = Object.values(IE_FLAGS);

// Direction / posting nature of the scheme.
//   INPUT  - tax on what the company buys (purchases / AP), potentially claimable.
//   OUTPUT - tax the company collects on sales (billing / AR).
// (CONTRA / reverse-charge is deferred past the first rollout - add it here when needed.)
const TAX_CLASSES = {
    INPUT: 'INPUT',
    OUTPUT: 'OUTPUT',
};
const TAX_CLASS_KEYS = Object.values(TAX_CLASSES);

// What a rate line represents. Purely descriptive - it does NOT change the pinned
// tax calculation (a 'Service Charge' line cascades and rounds exactly like a 'Tax'
// line). It is carried for reporting / GL classification only. Default 'Tax'.
const TAX_TYPES = {
    TAX: 'Tax',
    SERVICE_CHARGE: 'Service Charge',
};
const TAX_TYPE_KEYS = Object.values(TAX_TYPES);

module.exports = {
    IE_FLAGS,
    IE_FLAG_KEYS,
    TAX_CLASSES,
    TAX_CLASS_KEYS,
    TAX_TYPES,
    TAX_TYPE_KEYS,
};
