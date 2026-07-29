// src/platform/validate.js
//
// THE request-validation seam (Zod at the system boundary).
//
// Rules of the layer - agreed 2026-07-29:
//   1. Zod runs ONLY at system boundaries (HTTP request parts, and nothing else).
//   2. Internal functions/services/gateways are never wrapped in Zod.
//   3. Validate once, trust afterward: the middleware REPLACES req.body /
//      req.query / req.params with the parsed result - typed, trimmed where the
//      schema says so, and with unknown keys STRIPPED (Zod object default) so
//      nothing unexpected ever reaches a controller or Sequelize.
//
// Every NEW endpoint that reads a request body/query/params MUST mount
// validate() with a schema, the same standing rule as the rate-limiter
// factories in rateLimits.js.
//
// Failure contract: HTTP 400 { message, details:[{ field, message }] }.
// `message` carries the first issue so existing toast handling shows something
// actionable; the raw payload is never echoed back.

const { z } = require('zod');

// Express 5 defines req.query via a prototype getter, so plain assignment
// throws; defineProperty works for every part uniformly.
function setPart(req, part, value) {
    Object.defineProperty(req, part, { value, writable: true, configurable: true, enumerable: true });
}

function validate(schemas) {
    const parts = ['params', 'query', 'body'];
    return (req, res, next) => {
        for (const part of parts) {
            const schema = schemas[part];
            if (!schema) continue;
            const result = schema.safeParse(req[part] ?? {});
            if (!result.success) {
                const details = result.error.issues.map((issue) => ({
                    field: issue.path.join('.') || part,
                    message: issue.message,
                }));
                return res.status(400).json({
                    message: details[0] ? `${details[0].field}: ${details[0].message}` : 'Invalid request.',
                    details,
                });
            }
            setPart(req, part, result.data);
        }
        next();
    };
}

// Shared field vocabulary so every module's schemas agree on the basics.
// Length ceilings are generous but real: they bound pathological payloads
// without ever rejecting legitimate input.
const fields = {
    // Addressing a mailbox: trim first, then check the format.
    email: z.string('A valid email address is required.').trim().max(254)
        .pipe(z.email('Please provide a valid email address.')),
    // For LOGIN-style checks only: the stored hash decides, we just bound size.
    // (Do not enforce the floor here - accounts predating the floor must still
    // be able to log in and then be pushed to change the password.)
    existingPassword: z.string('Password is required.').min(1, 'Password is required.').max(256),
    // For points where a password is CHOSEN (register/reset/activate/change):
    // floor 8 matches the app-wide NIST minimum; HIBP runs after this gate.
    newPassword: z.string('Password is required.')
        .min(8, 'Password must be at least 8 characters.').max(256),
    // Opaque single-use tokens (email verification, reset, portal registration).
    token: z.string('A token is required.').trim().min(8, 'Invalid token.').max(4096),
    uuid: z.uuid('Invalid id.'),
    // TOTP or recovery code - exact shape is the MFA service's business.
    otpCode: z.string('A code is required.').trim().min(4, 'Invalid code.').max(64),
    // Human-entered single-line text (names, titles); presence enforced.
    requiredText: (max = 200) => z.string('This field is required.').trim()
        .min(1, 'This field is required.').max(max),
    optionalText: (max = 200) => z.string().trim().max(max).optional(),
};

module.exports = { validate, fields, z };
