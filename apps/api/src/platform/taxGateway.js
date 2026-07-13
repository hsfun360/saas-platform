// src/platform/taxGateway.js
//
// PEER-SERVICE SEAM: product systems (Membership / Facility / Golf) -> Tax.
//
// Tax is a separate service in the target architecture, so a product must NOT
// require() the tax module directly (golden rule #4). It calls through this seam
// instead. Today everything is one process, so the seam resolves in-process (lazy
// require of the tax resolver); when Tax is split out, only THIS file changes to an
// HTTP call via internalServiceUrl('tax') - the callers never change.
//
// It also encapsulates the mapping "active company -> tax scope": a company consumes
// the schemes for ITS OWN country (Company.countryCode), under its subscriber
// account. Consumers pass the request; they never assemble the scope themselves.

const { getUserContext, getPlatformProfile, internalServiceUrl } = require('./serviceContext');

// Resolve the active company's tax scope: { companyId, accountId, countryCode }.
// Returns null when there is no active workspace or the company has no country set
// (legacy rows with only free-text address country) - the caller surfaces that.
async function companyTaxScope(req) {
    const { companyId } = getUserContext(req);
    if (!companyId) return null;

    const Company = require('../modules/saas/company.model');
    const company = await Company.findByPk(companyId, { attributes: ['accountId', 'countryCode'] });
    if (!company || !company.accountId || !company.countryCode) return null;

    return { companyId, accountId: company.accountId, countryCode: company.countryCode };
}

// List the tax schemes available to the active company (by its country), each with
// its currently-effective components. What a billing screen calls to fill a picker.
// Returns { scope, schemes } so the caller can distinguish "no country set" (scope
// null) from "country set but no schemes yet" (scope set, schemes empty).
async function listCompanyTaxSchemes(req, onDate) {
    const scope = await companyTaxScope(req);
    if (!scope) return { scope: null, schemes: [] };

    // WHEN SPLIT: GET {internalServiceUrl('tax')}/internal/company-schemes?companyId&accountId&countryCode&date
    // Company-aware: filters schemes this company disabled + overlays its GL accounts.
    const { listSchemesForCompany } = require('../modules/tax/taxResolver');
    const schemes = await listSchemesForCompany({ ...scope, onDate });
    return { scope, schemes };
}

// Resolve ONE scheme's active components for the active company as of a date.
// Returns null if there is no scope or the code does not resolve. The result is
// snapshot-ready: the consumer copies code+rate onto its own transaction row.
async function resolveCompanyTaxScheme(req, taxSchemeCode, onDate) {
    const scope = await companyTaxScope(req);
    if (!scope) return null;

    // WHEN SPLIT: GET {internalServiceUrl('tax')}/internal/company-schemes/<code>?companyId&accountId&countryCode&date
    // Company-aware: null if the company disabled the scheme; GL accounts overlaid.
    const { resolveSchemeForCompany } = require('../modules/tax/taxResolver');
    return resolveSchemeForCompany({ ...scope, taxSchemeCode, onDate });
}

// Quote the tax on an amount for the active company: resolve the scheme (company
// adoption + GL overlay), then run the shared pure calculator. Returns a fully
// computed breakdown the consumer SNAPSHOTS onto its transaction row - the one call
// a charge makes at post time. `amount` is the net base for an EXCLUSIVE scheme, or
// the tax-inclusive gross for an INCLUSIVE one (the scheme's ieFlag decides). Null if
// the company has no country set or the scheme code does not resolve.
async function quoteTax(req, { taxSchemeCode, amount, onDate }) {
    const resolved = await resolveCompanyTaxScheme(req, taxSchemeCode, onDate);
    if (!resolved) return null;

    const { computeTax } = require('../modules/tax/taxCalculator');
    const breakdown = computeTax({ amount, ieFlag: resolved.scheme.ieFlag, components: resolved.components });
    return { scheme: resolved.scheme, asOf: resolved.asOf, ...breakdown };
}

// Quote the tax on a PLATFORM charge (e.g. a Subscription Fee, or any other fee the
// platform bills a subscriber). Unlike quoteTax (subscriber/company scope), the scope
// comes from the platform's own profile: its home country + its default tax scheme,
// resolved against the platform-owned catalog (accountId NULL). This is why a MY
// platform can never tax a charge with a Thai scheme - the country is pinned once, on
// the profile. Returns { quote } on success or { error } for a bad/missing config, so
// the caller (invoicing, or the admin test endpoint) can surface a clear message.
async function quotePlatformCharge({ amount, onDate }) {
    const profile = await getPlatformProfile();
    if (!profile) return { error: 'Set up the Platform Profile before quoting a charge.' };
    if (!profile.countryCode) return { error: 'The Platform Profile has no country set.' };
    if (!profile.defaultTaxSchemeCode) return { error: 'The Platform Profile has no default tax scheme set.' };

    // WHEN SPLIT: GET {internalServiceUrl('tax')}/internal/platform-schemes/<code>?countryCode&date
    const { resolveScheme } = require('../modules/tax/taxResolver');
    const resolved = await resolveScheme({
        accountId: null, // platform-owned catalog
        countryCode: profile.countryCode,
        taxSchemeCode: profile.defaultTaxSchemeCode,
        onDate,
    });
    if (!resolved) {
        return { error: `No active platform tax scheme '${profile.defaultTaxSchemeCode}' for ${profile.countryCode.toUpperCase()}.` };
    }

    const { computeTax } = require('../modules/tax/taxCalculator');
    const breakdown = computeTax({ amount, ieFlag: resolved.scheme.ieFlag, components: resolved.components });
    return { quote: { scheme: resolved.scheme, asOf: resolved.asOf, ...breakdown } };
}

module.exports = {
    companyTaxScope,
    listCompanyTaxSchemes,
    resolveCompanyTaxScheme,
    quoteTax,
    quotePlatformCharge,
    // Re-exported so a future split can read the peer URL from one import site.
    internalServiceUrl,
};
