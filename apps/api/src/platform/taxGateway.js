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

const { getUserContext, internalServiceUrl } = require('./serviceContext');

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

module.exports = {
    companyTaxScope,
    listCompanyTaxSchemes,
    resolveCompanyTaxScheme,
    // Re-exported so a future split can read the peer URL from one import site.
    internalServiceUrl,
};
