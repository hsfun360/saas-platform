'use strict';

// Per-environment SSO wiring, read from the environment only.
//
// There is deliberately NO built-in Google client: an environment without
// GOOGLE_CLIENT_ID offers no Google sign-in (the login screen hides the
// button) rather than silently starting the flow against another project's
// OAuth client, which surfaced as Google's "redirect_uri_mismatch" page when
// staging was first promoted without its own client (2026-11-02).

function readSsoConfig(env = process.env) {
    const googleClientId = (env.GOOGLE_CLIENT_ID || '').trim();
    return {
        googleClientId: googleClientId || null,
        microsoftEnabled: env.MICROSOFT_SSO_ENABLED !== 'false',
    };
}

// The client the code exchange must use, or null when Google sign-in is not
// configured here (both halves are required: the id starts the flow in the
// browser, the secret completes it on the server).
function googleOAuthClient(env = process.env) {
    const clientId = (env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (env.GOOGLE_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
}

module.exports = { readSsoConfig, googleOAuthClient };
