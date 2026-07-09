// src/modules/saas/accountEmailTemplate.controller.js
//
// Tenant self-service (Tenant Admin): a subscriber's OWN versions of the email
// templates the platform marked `tenantOverridable`. An override row
// (EmailTemplate with accountId = the subscriber's account) supersedes the
// platform default at render time. Reverting = deleting the override.
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

// The active company's logo URL (for previewing "include logo").
async function companyLogo(companyId) {
    if (!companyId) return null;
    const company = await Company.findByPk(companyId, { attributes: ['logo'] });
    return company ? company.logo : null;
}

// The platform default for a key IF it permits subscriber overrides, else null.
async function overridablePlatform(templateKey) {
    if (!catalogByKey.has(templateKey)) return null;
    const platform = await EmailTemplate.findOne({ where: { accountId: null, templateKey } });
    if (!platform || !platform.tenantOverridable) return null;
    return platform;
}

// GET /auth/account/email-templates -> the templates this subscriber may override,
// each flagged with whether they currently have an override.
exports.listOverridable = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const platform = await EmailTemplate.findAll({ where: { accountId: null, tenantOverridable: true } });
        const keys = platform.map((p) => p.templateKey);
        const overrides = keys.length
            ? await EmailTemplate.findAll({ where: { accountId, templateKey: keys } })
            : [];
        const ovByKey = new Map(overrides.map((o) => [o.templateKey, o]));

        const list = platform.map((p) => {
            const ov = ovByKey.get(p.templateKey);
            return {
                key: p.templateKey,
                name: p.name,
                description: p.description,
                hasOverride: !!ov,
                isActive: ov ? ov.isActive : null,
            };
        });
        res.status(200).json(list);
    } catch (error) {
        console.error('Error listing account email templates:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /auth/account/email-templates/:key -> the subscriber's override if present,
// else the platform default as a starting point, plus the default for reference.
exports.getForAccount = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const meta = catalogByKey.get(req.params.key);
        const platform = await overridablePlatform(req.params.key);
        if (!meta || !platform) return res.status(404).json({ message: 'This template is not available to customise.' });

        const override = await EmailTemplate.findOne({ where: { accountId, templateKey: req.params.key } });
        const src = override || platform;
        res.status(200).json({
            key: req.params.key,
            name: platform.name,
            description: platform.description,
            variables: [...meta.variables, ...GLOBAL_TEMPLATE_VARIABLES],
            sample: meta.sample,
            hasOverride: !!override,
            subject: src.subject,
            bodyHtml: src.bodyHtml,
            fromName: src.fromName,
            isActive: override ? override.isActive : true,
            brandColor: src.brandColor,
            includeLogo: src.includeLogo,
            // The active company's logo (shown in the Brand card + used when include-logo is on).
            companyLogoUrl: await companyLogo(req.user.companyId),
            platformDefault: { subject: platform.subject, bodyHtml: platform.bodyHtml, fromName: platform.fromName },
        });
    } catch (error) {
        console.error('Error fetching account email template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /auth/account/email-templates/:key  Body: { subject, bodyHtml, fromName?, isActive? }
exports.upsertOverride = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const meta = catalogByKey.get(req.params.key);
        const platform = await overridablePlatform(req.params.key);
        if (!meta || !platform) return res.status(403).json({ message: 'This template cannot be customised.' });

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
            where: { accountId, templateKey: req.params.key },
            defaults: {
                accountId,
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
        res.status(200).json({ message: 'Your template was saved.' });
    } catch (error) {
        console.error('Error saving account email template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /auth/account/email-templates/:key -> revert to the platform default.
exports.removeOverride = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });
        await EmailTemplate.destroy({ where: { accountId, templateKey: req.params.key } });
        res.status(200).json({ message: 'Reverted to the platform default.' });
    } catch (error) {
        console.error('Error removing account email template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /auth/account/email-templates/:key/preview  Body: { subject, bodyHtml, data? }
exports.previewOverride = async (req, res) => {
    try {
        const meta = catalogByKey.get(req.params.key);
        const platform = await overridablePlatform(req.params.key);
        if (!meta || !platform) return res.status(404).json({ message: 'Template not available.' });
        const data = { ...meta.sample, ...(req.body.data || {}) };
        // Reflect the editor's CURRENT (unsaved) brand settings, with the active
        // company's logo when "include logo" is ticked.
        const brand = buildBrand({
            brandColor: req.body.brandColor,
            includeLogo: !!req.body.includeLogo,
            companyLogoUrl: req.body.includeLogo ? await companyLogo(req.user.companyId) : null,
        });
        res.status(200).json(renderPreview(req.body.subject || '', req.body.bodyHtml || '', data, brand));
    } catch (e) {
        res.status(400).json({ message: `Template syntax error: ${e.message}` });
    }
};

// POST /auth/account/email-templates/:key/test  Body: { to, subject, bodyHtml, fromName?, data? }
exports.sendTest = async (req, res) => {
    try {
        const meta = catalogByKey.get(req.params.key);
        const platform = await overridablePlatform(req.params.key);
        if (!meta || !platform) return res.status(404).json({ message: 'Template not available.' });

        const to = (req.body.to || '').trim();
        if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
            return res.status(400).json({ message: 'A valid recipient email is required.' });
        }
        let rendered;
        try {
            const brand = buildBrand({
                brandColor: req.body.brandColor,
                includeLogo: !!req.body.includeLogo,
                companyLogoUrl: req.body.includeLogo ? await companyLogo(req.user.companyId) : null,
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
