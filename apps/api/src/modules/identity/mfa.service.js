// src/modules/identity/mfa.service.js
//
// TOTP MFA primitives (RFC 6238 via otplib) + recovery codes. The secret is
// stored AES-256-GCM encrypted under MFA_ENCRYPTION_KEY (its own key, so
// rotating it never touches SMTP credentials); recovery codes are stored as
// SHA-256 hashes and struck out on use.

const crypto = require('crypto');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const { withKey } = require('../../platform/secretbox');

const mfaBox = withKey('MFA_ENCRYPTION_KEY');

// Accept the previous/next 30s step - phone clocks drift.
authenticator.options = { window: 1 };

const ISSUER = process.env.MFA_ISSUER || 'ClubSaaS';

function generateSecret() {
    return authenticator.generateSecret(); // base32
}

function encryptSecret(secret) {
    return mfaBox.encrypt(secret);
}

function decryptSecret(ciphertext) {
    return mfaBox.decrypt(ciphertext);
}

function isMfaConfigured() {
    return mfaBox.isConfigured();
}

// otpauth:// URL + QR data-URI for the enrollment screen (generated locally -
// the secret never goes to a third-party chart service).
async function buildEnrollment(email, secret) {
    const otpauthUrl = authenticator.keyuri(email, ISSUER, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
    return { otpauthUrl, qrDataUrl };
}

function verifyTotp(code, encryptedSecret) {
    try {
        const token = String(code || '').replace(/\s+/g, '');
        if (!/^\d{6}$/.test(token)) return false;
        return authenticator.verify({ token, secret: decryptSecret(encryptedSecret) });
    } catch (e) {
        console.error('[MFA] TOTP verify failed:', e.message);
        return false;
    }
}

const hashRecoveryCode = (raw) =>
    crypto.createHash('sha256').update(String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');

// 8 one-time codes, XXXX-XXXX from an unambiguous alphabet (no 0/O/1/I).
function generateRecoveryCodes() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const codes = [];
    for (let i = 0; i < 8; i++) {
        let c = '';
        for (let j = 0; j < 8; j++) c += alphabet[crypto.randomInt(alphabet.length)];
        codes.push(`${c.slice(0, 4)}-${c.slice(4)}`);
    }
    return codes;
}

// True + the remaining hashes when `code` matches an unused recovery code.
function consumeRecoveryCode(code, storedHashes) {
    const hashes = Array.isArray(storedHashes) ? storedHashes : [];
    const h = hashRecoveryCode(code);
    if (!hashes.includes(h)) return { ok: false, remaining: hashes };
    return { ok: true, remaining: hashes.filter(x => x !== h) };
}

module.exports = {
    generateSecret,
    encryptSecret,
    isMfaConfigured,
    buildEnrollment,
    verifyTotp,
    generateRecoveryCodes,
    hashRecoveryCode,
    consumeRecoveryCode,
};
