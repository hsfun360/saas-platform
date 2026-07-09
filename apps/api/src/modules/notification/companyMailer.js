// src/modules/notification/companyMailer.js
//
// Resolves a COMPANY's own SMTP transport for the worker to dispatch email
// through (and for the API to build one when testing). Transports are cached per
// company and rebuilt when the config changes (keyed on updatedAt). Reading the
// saas CompanySmtpConfig here is an intentional monolith convenience; when the
// Notification service splits out, this becomes a control-plane lookup by id.

const nodemailer = require('nodemailer');
const CompanySmtpConfig = require('../saas/companySmtpConfig.model');
const secretbox = require('../../platform/secretbox');

const cache = new Map(); // companyId -> { stamp, transporter, from }

// Build a transporter + From header from a config row and its plaintext password.
function buildTransport(cfg, plainPassword) {
    const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: Number(cfg.port) || 587,
        secure: !!cfg.secure,
        auth: cfg.username ? { user: cfg.username, pass: plainPassword || '' } : undefined,
    });
    const name = cfg.fromName ? String(cfg.fromName).replace(/"/g, '').trim() : '';
    const from = name ? `"${name}" <${cfg.fromEmail}>` : cfg.fromEmail;
    return { transporter, from };
}

// The active transport for a company, or null if it has none configured/active.
async function resolveTransport(companyId) {
    const cfg = await CompanySmtpConfig.findOne({ where: { companyId, isActive: true } });
    if (!cfg) {
        cache.delete(companyId);
        return null;
    }
    const stamp = cfg.updatedAt ? cfg.updatedAt.getTime() : 0;
    const cached = cache.get(companyId);
    if (cached && cached.stamp === stamp) return cached;

    const pass = cfg.passwordEnc ? secretbox.decrypt(cfg.passwordEnc) : undefined;
    const entry = { stamp, ...buildTransport(cfg, pass) };
    cache.set(companyId, entry);
    return entry;
}

async function markError(companyId, message) {
    try {
        await CompanySmtpConfig.update(
            { lastError: String(message || 'Unknown error').slice(0, 500) },
            { where: { companyId } },
        );
    } catch (e) {
        console.error('[companyMailer] failed to record SMTP error:', e.message);
    }
}

async function markSuccess(companyId) {
    try {
        await CompanySmtpConfig.update(
            { lastError: null, lastVerifiedAt: new Date() },
            { where: { companyId } },
        );
    } catch (e) {
        console.error('[companyMailer] failed to record SMTP success:', e.message);
    }
}

module.exports = { buildTransport, resolveTransport, markError, markSuccess };
