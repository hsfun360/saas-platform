'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readSsoConfig, googleOAuthClient } = require('./ssoConfig');

test('an environment without GOOGLE_CLIENT_ID offers no Google client at all', () => {
    assert.deepEqual(readSsoConfig({}), { googleClientId: null, microsoftEnabled: true });
    assert.deepEqual(readSsoConfig({ GOOGLE_CLIENT_ID: '   ' }), { googleClientId: null, microsoftEnabled: true });
    assert.equal(googleOAuthClient({}), null);
});

test('the configured client id is served and the Microsoft toggle is honoured', () => {
    assert.deepEqual(
        readSsoConfig({ GOOGLE_CLIENT_ID: '123-abc.apps.googleusercontent.com', MICROSOFT_SSO_ENABLED: 'false' }),
        { googleClientId: '123-abc.apps.googleusercontent.com', microsoftEnabled: false },
    );
});

test('the code exchange needs both the id and the secret', () => {
    assert.equal(googleOAuthClient({ GOOGLE_CLIENT_ID: '123-abc' }), null);
    assert.equal(googleOAuthClient({ GOOGLE_CLIENT_SECRET: 's3cret' }), null);
    assert.deepEqual(
        googleOAuthClient({ GOOGLE_CLIENT_ID: ' 123-abc ', GOOGLE_CLIENT_SECRET: 's3cret' }),
        { clientId: '123-abc', clientSecret: 's3cret' },
    );
});
