// src/platform/passwordBreach.js
//
// Breached-password screening via the HaveIBeenPwned "Pwned Passwords" range
// API, using k-anonymity: only the FIRST FIVE characters of the SHA-1 ever
// leave this server - HIBP returns every known suffix in that range and the
// comparison happens locally, so neither the password nor enough of its hash
// to identify it is disclosed. No API key needed for this endpoint.
//
// Enforced at the points where a password is CHOSEN (register, reset, change,
// activate) - per OWASP/NIST - never as an inline block at login.
//
// FAIL-OPEN by design: if HIBP is slow or unreachable, the check passes. A
// password change must never depend on a third party's uptime.

const crypto = require('crypto');
const axios = require('axios');

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const TIMEOUT_MS = 2500;

// True when the password appears in a known public breach. False when it is
// clean OR when the check could not be performed (fail-open).
async function isPasswordBreached(password) {
    try {
        const sha1 = crypto.createHash('sha1').update(String(password)).digest('hex').toUpperCase();
        const prefix = sha1.slice(0, 5);
        const suffix = sha1.slice(5);

        const res = await axios.get(`${HIBP_RANGE_URL}${prefix}`, {
            timeout: TIMEOUT_MS,
            // Server pads every response to a similar size, so a network
            // observer cannot infer the range's population either.
            headers: { 'Add-Padding': 'true' },
            responseType: 'text',
        });

        // Response lines are "SUFFIX:COUNT"; padding entries have count 0.
        for (const line of String(res.data).split('\n')) {
            const [candidate, count] = line.trim().split(':');
            if (candidate === suffix && parseInt(count, 10) > 0) {
                return true;
            }
        }
        return false;
    } catch (err) {
        console.warn('[HIBP] breach check skipped (fail-open):', err.message);
        return false;
    }
}

// Shared user-facing message for the 400 when a breached password is chosen.
const BREACHED_PASSWORD_MESSAGE =
    'This password has appeared in a known data breach and cannot be used. Please choose a different password.';

module.exports = { isPasswordBreached, BREACHED_PASSWORD_MESSAGE };
