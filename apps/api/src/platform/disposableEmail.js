// src/platform/disposableEmail.js
//
// Disposable / temporary email detection for the REGISTRATION endpoints, using
// the bundled `disposable-email-domains` blocklist (~120k domains, vendored
// into the image - NO runtime network calls, so nothing to fail open). A
// domain the list misses just falls through to the email-verification
// requirement, so this degrades safely.

const domains = require('disposable-email-domains');

const BLOCKLIST = new Set(domains);

// True when the address's domain (or its registrable parent, so subdomain
// tricks like x.mailinator.com don't slip through) is a known disposable host.
function isDisposableEmail(email) {
    const at = String(email || '').lastIndexOf('@');
    if (at < 0) return false;
    const domain = String(email).slice(at + 1).trim().toLowerCase();
    if (!domain) return false;
    if (BLOCKLIST.has(domain)) return true;
    const parts = domain.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
        if (BLOCKLIST.has(parts.slice(i).join('.'))) return true;
    }
    return false;
}

const DISPOSABLE_EMAIL_MESSAGE =
    'Please use your work or personal email address - temporary email services are not supported.';

module.exports = { isDisposableEmail, DISPOSABLE_EMAIL_MESSAGE };
