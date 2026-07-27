// src/platform/secretbox.js
//
// Symmetric encryption for secrets we must store and later USE (unlike passwords,
// which are hashed one-way). Currently: subscriber SMTP passwords. AES-256-GCM
// (authenticated) with a single key from the environment, so it stays portable
// (12-factor) exactly like the JWT keys.
//
// Key: SMTP_ENCRYPTION_KEY, a 32-byte key as 64 hex chars OR base64. Set it on
// BOTH login-api (encrypt on save / decrypt for test) and the worker (decrypt to
// send). Without it, encrypt/decrypt throw loudly — the SMTP feature is inert but
// nothing else is affected.

const crypto = require('crypto');

// A secretbox bound to ONE key env var. Each secret family gets its own key
// (SMTP passwords, MFA secrets, ...) so rotating one never breaks the others.
function withKey(envVar) {
    function getKey() {
        // trim(): a Secret Manager / env value can arrive with a trailing newline.
        const raw = (process.env[envVar] || '').trim();
        if (!raw) throw new Error(`${envVar} is not configured.`);
        const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
        if (key.length !== 32) throw new Error(`${envVar} must be 32 bytes (64 hex chars or base64).`);
        return key;
    }

    // Returns "v1:<iv>:<tag>:<ciphertext>", all base64.
    function encrypt(plaintext) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
        const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
    }

    function decrypt(payload) {
        const parts = String(payload).split(':');
        if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Unrecognized ciphertext format.');
        const [, ivB, tagB, ctB] = parts;
        const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB, 'base64'));
        decipher.setAuthTag(Buffer.from(tagB, 'base64'));
        return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]).toString('utf8');
    }

    function isConfigured() {
        return !!process.env[envVar];
    }

    return { encrypt, decrypt, isConfigured };
}

// Default box: subscriber SMTP passwords (the original consumer - the worker
// also decrypts with this key). Kept as the module's top-level exports so the
// existing callers are untouched.
const smtpBox = withKey('SMTP_ENCRYPTION_KEY');

module.exports = { ...smtpBox, withKey };
