// src/modules/notification/mailer.js
//
// Shared SMTP transport for the whole platform. Used by the outbox worker to
// dispatch queued emails and by the admin/tenant API for "send test" previews,
// so there is ONE place that knows how mail leaves the system.

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // a Google "App Password", not the account password
    },
});

// Platform default display name, overridable per-template (EmailTemplate.fromName).
const DEFAULT_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Your App Name';

// Build a From header. The address is always the authenticated mailbox
// (EMAIL_USER); only the display name varies. Strip quotes so a template can't
// break the header.
function fromHeader(fromName) {
    const name = String(fromName || DEFAULT_FROM_NAME).replace(/"/g, '').trim();
    return `"${name}" <${process.env.EMAIL_USER}>`;
}

async function sendMail({ to, subject, html, from, fromName }) {
    return transporter.sendMail({
        from: from || fromHeader(fromName),
        to,
        subject,
        html,
    });
}

module.exports = { transporter, sendMail, fromHeader, DEFAULT_FROM_NAME };
