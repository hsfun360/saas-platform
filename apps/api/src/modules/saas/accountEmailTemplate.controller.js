// src/modules/saas/accountEmailTemplate.controller.js
//
// Tenant self-service (Tenant Admin): a subscriber's OWN versions of the email
// templates the platform marked `tenantOverridable`.
//
// Overrides are SCOPED, and resolve as a cascade at render time (resolveTemplate):
//   company row (accountId + companyId) -> subscriber-wide row (companyId NULL)
//   -> platform default.
// So two clubs on one subscription can each have their own subject/body/brand,
// while a subscriber that wants one version everywhere just keeps the
// subscriber-wide row. The editor picks the scope; `companyId` (query or body)
// selects it, and omitting it means "All companies" (the subscriber-wide row).
//
// Account resolution + Company live in this (saas) module; the render/catalogue
// logic is reused from the notification service.

const { v4: uuidv4 } = require('uuid');
const Company = require('./company.model');
const EmailTemplate = require('../notification/emailTemplate.model');
const OutboxMessage = require('../../platform/outboxMessage.model');
const { fromHeader } = require('../notification/mailer');
const { catalogByKey, GLOBAL_TEMPLATE_VARIABLES, renderPreview } = require('../notification/emailTemplate.service');
const { buildBrand } = require('../notification/emailBrand');

// The caller's accountId from their active company (null = System workspace).
async function resolveAccountId(companyId) {
    if (!companyId) return null;
    const company = await Company.findByPk(companyId, { attributes: ['accountId'] });
    return company ? company.accountId : null;
}

// Every company in the account (the scope picker's options).
function accountCompanies(accountId) {
    return Company.findAll({
        where: { accountId },
        attributes: ['id', 'name', 'logo'],
        order: [['name', 'ASC']],
    });
}

// The requested scope: a companyId that MUST belong to the caller's account, or
// null for the subscriber-wide row. Returns { error } when the id is not theirs.
async function resolveScope(raw, accountId) {
    const companyId = (raw || '').trim();
    if (!companyId) return { companyId: null };
    const company = await Company.findOne({ where: { id: companyId, accountId }, attributes: ['id', 'name', 'logo'] });
    if (!company) return { error: 'That company is not part of your account.' };
    return { companyId: company.id, company };
}

// The platform default for a key IF it permits subscriber overrides, else null.
async function overridablePlatform(templateKey) {
    if (!catalogByKey.has(templateKey)) return null;
    const platform = await EmailTemplate.findOne({ where: { accountId: null, templateKey } });
    if (!platform || !platform.tenantOverridable) return null;
    return platform;
}

// The logo to preview with: the scoped company's, else the caller's active company
// (a representative sample for the "All companies" scope, which has no one logo).
async function logoForScope(scopeCompany, activeCompanyId) {
    if (scopeCompany) return scopeCompany.logo || null;
    if (!activeCompanyId) return null;
    const company = await Company.findByPk(activeCompanyId, { attributes: ['logo'] });
    return company ? company.logo : null;
}

// GET /auth/account/email-templates -> the templates this subscriber may override,
// each flagged with whether any override exists and at which scopes.
exports.listOverridable = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const platform = await EmailTemplate.findAll({ where: { accountId: null, tenantOverridable: true } });
        const keys = platform.map((p) => p.templateKey);
        const overrides = keys.length
            ? await EmailTemplate.findAll({ where: { accountId, templateKey: keys } })
            : [];

        const byKey = new Map();
        for (const o of overrides) {
            if (!byKey.has(o.templateKey)) byKey.set(o.templateKey, { account: null, companies: [] });
            const e = byKey.get(o.templateKey);
            if (o.companyId) e.companies.push(o.companyId);
            else e.account = o;
        }

        const list = platform.map((p) => {
            const e = byKey.get(p.templateKey) || { account: null, companies: [] };
            return {
                key: p.templateKey,
                name: p.name,
                description: p.description,
                hasOverride: !!e.account || e.companies.length > 0,
                // Scope rollup, so the listing can say "2 clubs customised".
                hasAccountOverride: !!e.account,
                companyOverrideCount: e.companies.length,
                isActive: e.account ? e.account.isActive : null,
            };
        });
        res.status(200).json(list);
    } catch (error) {
        console.error('Error listing account email templates:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /auth/account/email-templates/:key[?companyId=] -> the row for that SCOPE if
// it has one, else the content it currently inherits (cascade) as a starting point.
exports.getForAccount = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const meta = catalogByKey.get(req.params.key);
        const platform = await overridablePlatform(req.params.key);
        if (!meta || !platform) return res.status(404).json({ message: 'This template is not available to customise.' });

        const scope = await resolveScope(req.query.companyId, accountId);
        if (scope.error) return res.status(403).json({ message: scope.error });

        const own = await EmailTemplate.findOne({
            where: { accountId, companyId: scope.companyId, templateKey: req.params.key },
        });
        // What this scope inherits when it has no row of its own.
        const accountRow = scope.companyId
            ? await EmailTemplate.findOne({ where: { accountId, companyId: null, templateKey: req.params.key } })
            : null;
        const src = own || accountRow || platform;

        res.status(200).json({
            key: req.params.key,
            name: platform.name,
            description: platform.description,
            variables: [...meta.variables, ...GLOBAL_TEMPLATE_VARIABLES],
            sample: meta.sample,
            // Scope state for the picker + the inherited/custom badge.
            scopeCompanyId: scope.companyId,
            companies: (await accountCompanies(accountId)).map((c) => ({ id: c.id, name: c.name })),
            hasOverride: !!own,
            inheritedFrom: own ? null : (accountRow ? 'account' : 'platform'),
            subject: src.subject,
            bodyHtml: src.bodyHtml,
            fromName: src.fromName,
            isActive: own ? own.isActive : true,
            brandColor: src.brandColor,
            includeLogo: src.includeLogo,
            // Logo shown in the Brand card + used when include-logo is on.
            companyLogoUrl: await logoForScope(scope.company, req.user.companyId),
            platformDefault: { subject: platform.subject, bodyHtml: platform.bodyHtml, fromName: platform.fromName },
        });
    } catch (error) {
        console.error('Error fetching account email template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /auth/account/email-templates/:key
// Body: { companyId?, subject, bodyHtml, fromName?, isActive?, brandColor?, includeLogo? }
// companyId omitted/null = the subscriber-wide row; set = that company's own row.
exports.upsertOverride = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const meta = catalogByKey.get(req.params.key);
        const platform = await overridablePlatform(req.params.key);
        if (!meta || !platform) return res.status(403).json({ message: 'This template cannot be customised.' });

        const scope = await resolveScope(req.body.companyId, accountId);
        if (scope.error) return res.status(403).json({ message: scope.error });

        const subject = req.body.subject;
        const bodyHtml = req.body.bodyHtml;
        if (!String(subject || '').trim() || !String(bodyHtml || '').trim()) {
            return res.status(400).json({ message: 'Subject and body are required.' });
        }
        try {
            renderPreview(subject, bodyHtml, meta.sample);
        } catch (e) {
            return res.status(400).json({ message: `Template syntax error: ${e.message}` });
        }

        const isActive = typeof req.body.isActive === 'boolean' ? req.body.isActive : true;
        const fromName = (req.body.fromName || '').trim() || null;
        const brandColor = (req.body.brandColor || '').trim() || null;
        const includeLogo = !!req.body.includeLogo;

        const [row] = await EmailTemplate.findOrCreate({
            where: { accountId, companyId: scope.companyId, templateKey: req.params.key },
            defaults: {
                accountId,
                companyId: scope.companyId,
                templateKey: req.params.key,
                name: platform.name,
                description: platform.description,
                subject,
                bodyHtml,
                fromName,
                tenantOverridable: false,
                isActive,
                brandColor,
                includeLogo,
            },
        });
        await row.update({ subject, bodyHtml, fromName, isActive, brandColor, includeLogo });
        res.status(200).json({
            message: scope.company ? `Saved for ${scope.company.name}.` : 'Saved for all companies.',
        });
    } catch (error) {
        console.error('Error saving account email template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /auth/account/email-templates/:key[?companyId=] -> drop THAT scope's row,
// so it falls back to what it inherits (subscriber-wide row, else platform default).
exports.removeOverride = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const scope = await resolveScope(req.query.companyId, accountId);
        if (scope.error) return res.status(403).json({ message: scope.error });

        await EmailTemplate.destroy({
            where: { accountId, companyId: scope.companyId, templateKey: req.params.key },
        });
        res.status(200).json({
            message: scope.company
                ? `${scope.company.name} now uses the shared version.`
                : 'Reverted to the platform default.',
        });
    } catch (error) {
        console.error('Error removing account email template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /auth/account/email-templates/:key/preview
// Body: { companyId?, subject, bodyHtml, brandColor?, includeLogo?, data? }
exports.previewOverride = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const meta = catalogByKey.get(req.params.key);
        const platform = await overridablePlatform(req.params.key);
        if (!meta || !platform) return res.status(404).json({ message: 'Template not available.' });

        const scope = await resolveScope(req.body.companyId, accountId);
        if (scope.error) return res.status(403).json({ message: scope.error });

        const data = { ...meta.sample, ...(req.body.data || {}) };
        // Reflect the editor's CURRENT (unsaved) brand settings, with the scoped
        // company's logo when "include logo" is ticked.
        const brand = buildBrand({
            brandColor: req.body.brandColor,
            includeLogo: !!req.body.includeLogo,
            companyLogoUrl: req.body.includeLogo ? await logoForScope(scope.company, req.user.companyId) : null,
        });
        res.status(200).json(renderPreview(req.body.subject || '', req.body.bodyHtml || '', data, brand));
    } catch (e) {
        res.status(400).json({ message: `Template syntax error: ${e.message}` });
    }
};

// POST /auth/account/email-templates/:key/test
// Body: { companyId?, to, subject, bodyHtml, fromName?, brandColor?, includeLogo?, data? }
exports.sendTest = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const meta = catalogByKey.get(req.params.key);
        const platform = await overridablePlatform(req.params.key);
        if (!meta || !platform) return res.status(404).json({ message: 'Template not available.' });

        const scope = await resolveScope(req.body.companyId, accountId);
        if (scope.error) return res.status(403).json({ message: scope.error });

        const to = (req.body.to || '').trim();
        if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
            return res.status(400).json({ message: 'A valid recipient email is required.' });
        }
        let rendered;
        try {
            const brand = buildBrand({
                brandColor: req.body.brandColor,
                includeLogo: !!req.body.includeLogo,
                companyLogoUrl: req.body.includeLogo ? await logoForScope(scope.company, req.user.companyId) : null,
            });
            rendered = renderPreview(req.body.subject || '', req.body.bodyHtml || '', { ...meta.sample, ...(req.body.data || {}) }, brand);
        } catch (e) {
            return res.status(400).json({ message: `Template syntax error: ${e.message}` });
        }

        await OutboxMessage.create({
            id: uuidv4(),
            type: 'EmailQueued',
            payload: {
                templateKey: `${req.params.key} (test)`,
                // Send the test through the scoped company's own SMTP when it has one.
                companyId: scope.companyId || req.user.companyId || null,
                to,
                from: fromHeader(req.body.fromName),
                subject: `[TEST] ${rendered.subject}`,
                html: rendered.html,
            },
        });
        res.status(202).json({ message: `Test email queued to ${to}. It should arrive shortly.` });
    } catch (error) {
        console.error('Error sending account test email:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
