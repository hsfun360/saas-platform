// src/modules/notification/emailTemplate.service.js
//
// The "Template Engine" from the outbox architecture: resolves the effective
// template for a key (subscriber override > platform default), compiles its
// Handlebars subject + body against the event data, and returns a finished email.
// Also owns seeding the platform defaults and resetting one to its catalogue value.

const Handlebars = require('handlebars');
const EmailTemplate = require('./emailTemplate.model');
const Company = require('../saas/company.model');
const catalog = require('./email-templates.catalog');
const { buildBrand, applyBrandToHtml } = require('./emailBrand');

const catalogByKey = new Map(catalog.map((t) => [t.key, t]));

// Brand-derived variables available to EVERY template (in addition to each
// template's producer variables). Surfaced in the editor's "Insert variable" menu.
// `brandHeaderHtml` is intentionally omitted: it must be emitted raw ({{{...}}}),
// which the chip inserter can't express, so it lives in the default body instead.
const GLOBAL_TEMPLATE_VARIABLES = [
    { name: 'brandColor', description: "The brand accent colour (Company → Brand); use it for button backgrounds, e.g. background-color: {{brandColor}}." },
    { name: 'logoUrl', description: 'The company logo URL (empty when none is set or the header logo is off).' },
];

// Cache compiled templates by their source string (bounded by the number of
// distinct templates, which is small).
const compileCache = new Map();
function compile(source) {
    const str = source || '';
    let fn = compileCache.get(str);
    if (!fn) {
        fn = Handlebars.compile(str, { noEscape: false });
        compileCache.set(str, fn);
    }
    return fn;
}

// Subjects are a plain-text mail header, not HTML: escaping would show literal
// "&amp;" in the inbox for values like "Golf & Country Club". Separate cache so
// the same source string can safely exist in both modes.
const subjectCompileCache = new Map();
function compileSubject(source) {
    const str = source || '';
    let fn = subjectCompileCache.get(str);
    if (!fn) {
        fn = Handlebars.compile(str, { noEscape: true });
        subjectCompileCache.set(str, fn);
    }
    return fn;
}

// Context every template can rely on regardless of the producer's data.
function globalContext() {
    return {
        brandName: process.env.EMAIL_FROM_NAME || 'Your App Name',
        frontendBaseUrl: process.env.FRONTEND_BASE_URL || '',
        year: new Date().getFullYear(),
    };
}

// The effective template for a key: an active subscriber override (only when the
// platform default permits overrides) wins; otherwise the platform default row.
async function resolveTemplate(templateKey, accountId) {
    const platform = await EmailTemplate.findOne({ where: { accountId: null, templateKey } });
    if (accountId && platform && platform.tenantOverridable) {
        const override = await EmailTemplate.findOne({ where: { accountId, templateKey, isActive: true } });
        if (override) return override;
    }
    return platform;
}

// Render the effective template to a finished email. Returns null when the email
// type is disabled (a suppressed platform default), so callers skip sending.
// `companyId` (when the producer sends on behalf of a company) resolves that
// company's brand into {{brandColor}} / {{{brandHeaderHtml}}}.
async function renderEmail(templateKey, accountId, data, companyId = null) {
    const tpl = await resolveTemplate(templateKey, accountId);
    if (!tpl) throw new Error(`No email template registered for key "${templateKey}"`);
    if (tpl.isActive === false) return null;

    // Brand colour + include-logo flag come from the template; the logo itself is
    // the sending company's (only fetched when the template wants it).
    let companyLogoUrl = null;
    if (companyId && tpl.includeLogo) {
        const company = await Company.findByPk(companyId, { attributes: ['logo'] });
        companyLogoUrl = company ? company.logo : null;
    }
    const brand = buildBrand({ brandColor: tpl.brandColor, includeLogo: tpl.includeLogo, companyLogoUrl });
    const ctx = { ...globalContext(), ...(data || {}), ...brand };
    return {
        subject: compileSubject(tpl.subject)(ctx).trim(),
        html: applyBrandToHtml(compile(tpl.bodyHtml)(ctx), brand),
        fromName: tpl.fromName || catalogByKey.get(templateKey)?.fromName || null,
    };
}

// Compile ad-hoc (unsaved) subject/body strings for the editor's live preview /
// test send. Throws on invalid Handlebars, so the controller can return 400.
// `brand` is an optional brand context (from buildBrand) reflecting the editor's
// current (unsaved) brand settings; when omitted the neutral default is used.
function renderPreview(subjectSource, bodySource, data, brand = null) {
    const b = brand || buildBrand();
    const ctx = { ...globalContext(), ...(data || {}), ...b };
    return {
        subject: compileSubject(subjectSource)(ctx).trim(),
        html: applyBrandToHtml(compile(bodySource)(ctx), b),
    };
}

// Idempotently insert any missing platform defaults from the catalogue. Safe to
// run on every boot; never overwrites an admin's edits.
async function seedPlatformDefaults() {
    for (const t of catalog) {
        await EmailTemplate.findOrCreate({
            where: { accountId: null, templateKey: t.key },
            defaults: {
                accountId: null,
                templateKey: t.key,
                name: t.name,
                description: t.description || null,
                subject: t.subject,
                bodyHtml: t.bodyHtml,
                fromName: t.fromName || null,
                tenantOverridable: !!t.tenantOverridable,
                isActive: true,
                brandColor: t.brandColor || null,
                includeLogo: !!t.includeLogo,
            },
        });
    }
}

// Reset one platform default back to its catalogue value.
async function resetPlatformDefault(templateKey) {
    const t = catalogByKey.get(templateKey);
    if (!t) return null;
    const [row] = await EmailTemplate.findOrCreate({
        where: { accountId: null, templateKey },
        defaults: { accountId: null, templateKey, name: t.name, subject: t.subject, bodyHtml: t.bodyHtml },
    });
    await row.update({
        name: t.name,
        description: t.description || null,
        subject: t.subject,
        bodyHtml: t.bodyHtml,
        fromName: t.fromName || null,
        tenantOverridable: !!t.tenantOverridable,
        isActive: true,
        brandColor: t.brandColor || null,
        includeLogo: !!t.includeLogo,
    });
    return row;
}

module.exports = {
    catalog,
    catalogByKey,
    GLOBAL_TEMPLATE_VARIABLES,
    resolveTemplate,
    renderEmail,
    renderPreview,
    seedPlatformDefaults,
    resetPlatformDefault,
};
