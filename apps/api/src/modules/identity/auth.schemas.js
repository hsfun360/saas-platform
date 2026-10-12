// src/modules/identity/auth.schemas.js
//
// Request schemas for the identity/auth boundary (see platform/validate.js for
// the rules of the layer). These cover the UNAUTHENTICATED surface first - the
// endpoints an attacker can reach without credentials - plus the
// session-holder password/MFA endpoints.
//
// Controllers keep their business checks (HIBP, disposable-email, cooldowns);
// these schemas only guarantee shape: right fields, right types, bounded
// sizes, unknown keys stripped.

const { z, fields } = require('../../platform/validate');

const registerUser = {
    body: z.object({
        email: fields.email,
        password: fields.newPassword,
    }),
};

// The workspace picked on the 206 picker: a company id, or the 'SYSTEM'
// sentinel the API itself emits for the platform workspace (companyId NULL).
// A uuid-only rule here rejected every System Administration login from the
// picker with a 400 (2026-07-29 to 2026-10-12).
const selectedWorkspace = z.union([fields.uuid, z.literal('SYSTEM')]).nullish();

const login = {
    body: z.object({
        email: fields.email,
        password: fields.existingPassword,
        selectedCompanyId: selectedWorkspace,
        rememberMe: z.boolean().optional(),
    }),
};

const forgotPassword = {
    body: z.object({ email: fields.email }),
};

const resetPassword = {
    body: z.object({
        token: fields.token,
        newPassword: fields.newPassword,
    }),
};

const verifyEmail = {
    body: z.object({ token: fields.token }),
};

const registerLead = {
    body: z.object({
        email: fields.email,
        name: fields.requiredText(200),
        companyName: fields.requiredText(200),
        subscriptionPlan: fields.optionalText(100),
        timezone: fields.optionalText(100),
        source: fields.optionalText(100),
    }),
};

const activateAccount = {
    body: z.object({
        token: fields.token,
        password: fields.newPassword,
    }),
};

// SSO: the provider token is opaque to us; bound it and pass through.
const googleLogin = {
    body: z.object({
        accessToken: z.string('No token provided').min(10, 'No token provided').max(8192),
        selectedCompanyId: selectedWorkspace,
    }),
};

const googleExchangeCode = {
    body: z.object({
        code: z.string('An authorization code is required.').trim().min(4).max(2048),
        redirectUri: z.string().trim().max(2048).pipe(z.url('Invalid redirect URI.')),
    }),
};

// The Microsoft handler reads only the token (the web never sends a workspace
// pick on this door), so the schema declares exactly that.
const microsoftLogin = {
    body: z.object({
        accessToken: z.string('No token provided').min(10, 'No token provided').max(8192),
    }),
};

const mfaVerify = {
    body: z.object({
        mfaToken: fields.token,
        code: fields.otpCode,
        // "Don't ask again on this device for 30 days" (trusted-device cookie).
        rememberDevice: z.boolean().optional(),
    }),
};

const mfaCode = {
    body: z.object({ code: fields.otpCode }),
};

const changePassword = {
    body: z.object({
        currentPassword: fields.existingPassword,
        newPassword: fields.newPassword,
    }),
};

const provisionOnboarding = {
    body: z.object({
        subscriberName: fields.requiredText(200),
        // Falls back to subscriberName in the controller when omitted/blank.
        companyName: fields.optionalText(200),
        moduleIds: z.array(fields.uuid).max(100).optional(),
    }),
};

module.exports = {
    registerUser,
    login,
    forgotPassword,
    resetPassword,
    verifyEmail,
    registerLead,
    activateAccount,
    googleLogin,
    googleExchangeCode,
    microsoftLogin,
    mfaVerify,
    mfaCode,
    changePassword,
    provisionOnboarding,
};
