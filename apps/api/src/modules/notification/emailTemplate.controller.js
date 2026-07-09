// src/modules/notification/emailTemplate.controller.js
//
// System-Admin maintenance of the PLATFORM email templates (accountId = null):
// list, view, edit, reset-to-default, live preview, and send a test. Test sends
// go through the transactional outbox so they reuse the worker's mail transport
// (the API process itself doesn't need SMTP credentials).

const { v4: uuidv4 } = require('uuid');
const EmailTemplate = require('./emailTemplate.model');
const OutboxMessage = require('../../platform/outboxMessage.model');
const { fromHeader } = require('./mailer');
const {
    catalog,
    catalogByKey,
    GLOBAL_TEMPLATE_VARIABLES,
    renderPreview,
    resetPlatformDefault,
} = require('./emailTemplate.service');
const { buildBrand } = require('./emailBrand');

// Platform templates have no sending company, so there is no logo to include in
// previews here — only the brand colour shows. (The logo is added per company at
// send time.) Build the preview brand from the editor's current settings.
function previewBrand(body) {
    return buildBrand({ brandColor: body.brandColor, includeLogo: !!body.includeLogo, companyLogoUrl: null });
}

// Shape a platform row + its catalogue metadata for the editor.
function present(row, meta) {
    return {
        key: row.templateKey,
        name: row.name,
        description: row.description,
        subject: row.subject,
        bodyHtml: row.bodyHtml,
        fromName: row.fromName,
        tenantOverridable: row.tenantOverridable,
        isActive: row.isActive,
        brandColor: row.brandColor,
        includeLogo: row.includeLogo,
        // Platform editor has no single sending company, so there's no logo to preview.
        companyLogoUrl: null,
        variables: meta ? [...meta.variables, ...GLOBAL_TEMPLATE_VARIABLES] : [...GLOBAL_TEMPLATE_VARIABLES],
        sample: meta ? meta.sample : {},
    };
}

// GET /api/admin/email-templates -> all platform templates (catalogue order).
exports.listPlatformTemplates = async (req, res) => {
    try {
        const rows = await EmailTemplate.findAll({ where: { accountId: null } });
        const byKey = new Map(rows.map((r) => [r.templateKey, r]));
        const list = catalog
            .filter((c) => byKey.has(c.key))
            .map((c) => {
                const r = byKey.get(c.key);
                return {
                    key: r.templateKey,
                    name: r.name,
                    description: r.description,
                    tenantOverridable: r.tenantOverridable,
                    isActive: r.isActive,
                };
            });
        res.status(200).json(list);
    } catch (error) {
        console.error('Error listing email templates:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/admin/email-templates/:key -> one platform template (+ variables/sample).
exports.getPlatformTemplate = async (req, res) => {
    try {
        const meta = catalogByKey.get(req.params.key);
        if (!meta) return res.status(404).json({ message: 'Unknown template.' });
        const row = await EmailTemplate.findOne({ where: { accountId: null, templateKey: req.params.key } });
        if (!row) return res.status(404).json({ message: 'Template not found.' });
        res.status(200).json(present(row, meta));
    } catch (error) {
        console.error('Error fetching email template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/admin/email-templates/:key
// Body: { name?, description?, subject, bodyHtml, fromName?, tenantOverridable?, isActive? }
exports.updatePlatformTemplate = async (req, res) => {
    try {
        const meta = catalogByKey.get(req.params.key);
        if (!meta) return res.status(404).json({ message: 'Unknown template.' });
        const row = await EmailTemplate.findOne({ where: { accountId: null, templateKey: req.params.key } });
        if (!row) return res.status(404).json({ message: 'Template not found.' });

        const subject = (req.body.subject ?? row.subject);
        const bodyHtml = (req.body.bodyHtml ?? row.bodyHtml);
        if (!String(subject).trim() || !String(bodyHtml).trim()) {
            return res.status(400).json({ message: 'Subject and body are required.' });
        }
        // Reject invalid Handlebars before saving.
        try {
            renderPreview(subject, bodyHtml, meta.sample);
        } catch (e) {
            return res.status(400).json({ message: `Template syntax error: ${e.message}` });
        }

        const updates = { subject, bodyHtml };
        if (typeof req.body.name === 'string' && req.body.name.trim()) updates.name = req.body.name.trim();
        if (typeof req.body.description === 'string') updates.description = req.body.description.trim() || null;
        if ('fromName' in req.body) updates.fromName = (req.body.fromName || '').trim() || null;
        if (typeof req.body.tenantOverridable === 'boolean') updates.tenantOverridable = req.body.tenantOverridable;
        if (typeof req.body.isActive === 'boolean') updates.isActive = req.body.isActive;
        if ('brandColor' in req.body) updates.brandColor = (req.body.brandColor || '').trim() || null;
        if (typeof req.body.includeLogo === 'boolean') updates.includeLogo = req.body.includeLogo;

        await row.update(updates);
        res.status(200).json({ message: 'Template saved.', template: present(row, meta) });
    } catch (error) {
        console.error('Error updating email template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/admin/email-templates/:key/reset -> restore the catalogue default.
exports.resetPlatformTemplate = async (req, res) => {
    try {
        const meta = catalogByKey.get(req.params.key);
        if (!meta) return res.status(404).json({ message: 'Unknown template.' });
        const row = await resetPlatformDefault(req.params.key);
        res.status(200).json({ message: 'Template reset to default.', template: present(row, meta) });
    } catch (error) {
        console.error('Error resetting email template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/admin/email-templates/:key/preview  Body: { subject, bodyHtml, data? }
// Renders the (possibly unsaved) content against sample data. No send.
exports.previewTemplate = async (req, res) => {
    try {
        const meta = catalogByKey.get(req.params.key);
        if (!meta) return res.status(404).json({ message: 'Unknown template.' });
        const data = { ...meta.sample, ...(req.body.data || {}) };
        const out = renderPreview(req.body.subject || '', req.body.bodyHtml || '', data, previewBrand(req.body));
        res.status(200).json(out);
    } catch (e) {
        res.status(400).json({ message: `Template syntax error: ${e.message}` });
    }
};

// POST /api/admin/email-templates/:key/test  Body: { to, subject, bodyHtml, fromName?, data? }
// Renders the (possibly unsaved) content and queues it to `to` via the outbox.
exports.sendTestEmail = async (req, res) => {
    try {
        const meta = catalogByKey.get(req.params.key);
        if (!meta) return res.status(404).json({ message: 'Unknown template.' });
        const to = (req.body.to || '').trim();
        if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
            return res.status(400).json({ message: 'A valid recipient email is required.' });
        }
        let rendered;
        try {
            rendered = renderPreview(req.body.subject || '', req.body.bodyHtml || '', { ...meta.sample, ...(req.body.data || {}) }, previewBrand(req.body));
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
        console.error('Error sending test email:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
