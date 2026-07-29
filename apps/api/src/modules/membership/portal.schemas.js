// src/modules/membership/portal.schemas.js
//
// Request schemas for the PUBLIC portal-registration boundary (member portal
// + sales-agent portal). The signed registration token is the credential;
// these schemas only bound its shape and enforce the password floor before
// the controllers run their token/HIBP checks.

const { z, fields } = require('../../platform/validate');

const registrationContext = {
    query: z.object({ token: fields.token }),
};

const register = {
    body: z.object({
        token: fields.token,
        password: fields.newPassword,
    }),
};

module.exports = { registrationContext, register };
