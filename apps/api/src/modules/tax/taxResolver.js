// Tax resolution - the read-side service interface the product systems
// (Membership / Facility / Golf) call to price a transaction.
//
// The contract is deliberately narrow and one-directional: a consumer passes the
// subscriber + country + scheme code + a date, and gets back the ACTIVE tax
// components as of that date. The consumer then SNAPSHOTS those values onto its own
// transaction row (code + rate + claimability). It never live-joins to these tables,
// so historical documents keep the rate they were charged even after the catalog
// changes.
//
// Callers reach this through the serviceContext seam (in-process today, an HTTP call
// when the Tax service is split out) - they do not require the models directly.

const { Op } = require('sequelize');
const TaxScheme = require('./taxScheme.model');
const TaxRate = require('./taxRate.model');
const CompanyTaxScheme = require('./companyTaxScheme.model');
const CompanyTaxAccount = require('./companyTaxAccount.model');

// Today as an ISO date (YYYY-MM-DD), the default "as of" for resolution.
function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

// Snapshot shape a consumer stores on its transaction line. Everything needed to
// reproduce the charge without reading the catalog again.
function toComponentSnapshot(rate) {
    return {
        taxCode: rate.taxCode,
        taxRate: Number(rate.taxRate),
        taxPriority: rate.taxPriority,
        isClaimable: rate.isClaimable,
        claimPercentage: Number(rate.claimPercentage),
        glAccountCode: rate.glAccountCode || null,
        effectiveFrom: rate.effectiveFrom,
    };
}

// Resolve one scheme's active components as of a date.
//   { accountId, countryCode, taxSchemeCode, onDate? } -> null | { scheme, components }
// For each taxCode we take the row with the greatest effectiveFrom <= onDate, so a
// scheme's concurrent components come back together, ordered by taxPriority.
async function resolveScheme({ accountId, countryCode, taxSchemeCode, onDate }) {
    if (!accountId || !countryCode || !taxSchemeCode) return null;
    const date = onDate || todayIso();

    const scheme = await TaxScheme.findOne({
        where: { accountId, countryCode, taxSchemeCode, isActive: true },
    });
    if (!scheme) return null;

    // All candidate rate rows effective on/before the date, newest first per code.
    const rows = await TaxRate.findAll({
        where: {
            taxSchemeId: scheme.id,
            isActive: true,
            effectiveFrom: { [Op.lte]: date },
        },
        order: [['taxCode', 'ASC'], ['effectiveFrom', 'DESC']],
    });

    // Keep only the latest-effective row per taxCode (rows are already newest-first).
    const latestByCode = new Map();
    for (const r of rows) {
        if (!latestByCode.has(r.taxCode)) latestByCode.set(r.taxCode, r);
    }

    const components = [...latestByCode.values()]
        .sort((a, b) => a.taxPriority - b.taxPriority || a.taxCode.localeCompare(b.taxCode))
        .map(toComponentSnapshot);

    return {
        scheme: {
            id: scheme.id,
            taxSchemeCode: scheme.taxSchemeCode,
            name: scheme.name,
            countryCode: scheme.countryCode,
            ieFlag: scheme.ieFlag,
            taxClass: scheme.taxClass,
        },
        asOf: date,
        components,
    };
}

// List the schemes available to a subscriber in a country (active only), each with
// its currently-effective components. Used to populate a consumer's tax picker.
async function listSchemes({ accountId, countryCode, onDate }) {
    if (!accountId || !countryCode) return [];
    const schemes = await TaxScheme.findAll({
        where: { accountId, countryCode, isActive: true },
        order: [['taxSchemeCode', 'ASC']],
    });

    const resolved = [];
    for (const s of schemes) {
        const r = await resolveScheme({ accountId, countryCode, taxSchemeCode: s.taxSchemeCode, onDate });
        if (r) resolved.push(r);
    }
    return resolved;
}

// ---- Company-aware resolution (adoption + GL overrides) -------------------
// A company consumes its subscriber's schemes filtered by its own CompanyTaxScheme
// adoption (opt-out: absence = enabled) with per-component GL accounts overlaid.

// Load a company's adoption rows once, indexed by taxSchemeId -> { isEnabled, gl }.
// `gl` is a Map(taxCode -> glAccountCode) of that company's overrides.
async function loadCompanyOverrides(companyId) {
    const rows = await CompanyTaxScheme.findAll({
        where: { companyId },
        include: [{ model: CompanyTaxAccount, as: 'GlOverrides' }],
    });
    const bySchemeId = new Map();
    for (const row of rows) {
        const gl = new Map((row.GlOverrides || []).map((o) => [o.taxCode, o.glAccountCode]));
        bySchemeId.set(row.taxSchemeId, { isEnabled: row.isEnabled, gl });
    }
    return bySchemeId;
}

// Apply a company's GL overrides to a resolved scheme's components (in place-safe).
function applyGlOverrides(resolved, gl) {
    if (!resolved) return resolved;
    return {
        ...resolved,
        components: resolved.components.map((c) => ({
            ...c,
            glAccountCode: gl && gl.has(c.taxCode) ? gl.get(c.taxCode) : c.glAccountCode,
        })),
    };
}

// Resolve one scheme for a specific company: null if the company disabled it (or it
// does not resolve), otherwise the resolved scheme with company GL overlaid.
async function resolveSchemeForCompany({ accountId, countryCode, companyId, taxSchemeCode, onDate }) {
    const resolved = await resolveScheme({ accountId, countryCode, taxSchemeCode, onDate });
    if (!resolved) return null;

    const override = (await loadCompanyOverrides(companyId)).get(resolved.scheme.id);
    if (override && override.isEnabled === false) return null; // company opted out
    return applyGlOverrides(resolved, override && override.gl);
}

// List the schemes a company actually uses (enabled) with company GL overlaid.
async function listSchemesForCompany({ accountId, countryCode, companyId, onDate }) {
    const base = await listSchemes({ accountId, countryCode, onDate });
    if (!base.length) return [];

    const overrides = await loadCompanyOverrides(companyId);
    const out = [];
    for (const resolved of base) {
        const override = overrides.get(resolved.scheme.id);
        if (override && override.isEnabled === false) continue; // opted out
        out.push(applyGlOverrides(resolved, override && override.gl));
    }
    return out;
}

module.exports = {
    resolveScheme,
    listSchemes,
    resolveSchemeForCompany,
    listSchemesForCompany,
};
