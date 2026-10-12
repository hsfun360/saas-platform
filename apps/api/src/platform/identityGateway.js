// src/platform/identityGateway.js
//
// INTER-SERVICE CONTRACT SEAM for the Identity service's writes and reads.
//
// The Identity service owns the `User` table and token minting (golden rule:
// one owner per table). A product service that needs a user account created -
// today the Membership service's member-portal self-registration - must NOT
// require the User model; it calls this gateway instead. The same goes for
// READS: product tables carry user ids as plain UUIDs (createdBy, a workflow
// task's assignee) and resolve them to a display name + address here.
//
// IN-PROCESS IMPLEMENTATION (monolith): lazy require of the identity model.
// WHEN SPLIT: POST {identity}/api/auth/portal-users and the callers never change.

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getPrivateKey } = require('./jwt.keys');

// Find-or-create the user account behind a member-portal registration.
// The caller has already proven control of `email` (a signed registration token
// delivered TO that address), which is the same proof password-reset relies on.
//
// - No user with that email -> create a verified local user with the given
//   password. Returns { userId, created: true }.
// - A user already exists -> return it WITHOUT touching the password (the
//   existing credentials stay the only way in). Returns { userId, created: false }.
async function provisionPortalUser({ email, fullName, password }) {
    const User = require('../modules/identity/user.model');

    const existing = await User.findOne({ where: { email } });
    if (existing) return { userId: existing.id, created: false };

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = await User.create({
        email,
        password: hashedPassword,
        full_name: fullName || email,
        authMethod: 'local',
        isVerified: true, // the registration link proved the address
        verificationToken: null,
    });
    return { userId: user.id, created: true };
}

// Mint a standard session token (same claim shape as Identity's login token).
// A portal member has no staff workspace, so the company claims stay null -
// staff endpoints (which key off companyId) simply see "no active workspace".
function issueLoginToken(userId, email) {
    return jwt.sign(
        { id: userId, email, companyId: null, companyName: null, isSystemAdmin: false },
        getPrivateKey(),
        { algorithm: 'RS256', expiresIn: '24h' },
    );
}

// --- Reads -------------------------------------------------------------------

function toUserDto(u) {
    return { id: u.id, name: u.full_name || u.email, email: u.email };
}

// Resolve a batch of user ids to { id, name, email } (name = full name, falling
// back to the address). Returns a Map keyed by id; ids with no user are simply
// absent. `transaction` joins the caller's transaction when the read must see
// its own uncommitted rows or hold its locks (the worker's SLA scan).
// WHEN SPLIT: GET {identity}/internal/users?ids=... and the callers never change.
async function lookupUsers(ids, { transaction } = {}) {
    const byId = new Map();
    const unique = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))];
    if (!unique.length) return byId;
    const User = require('../modules/identity/user.model');
    const rows = await User.findAll({ where: { id: unique }, attributes: ['id', 'full_name', 'email'], transaction });
    for (const u of rows) byId.set(u.id, toUserDto(u));
    return byId;
}

// One user as { id, name, email }, or null when the id is unknown.
// WHEN SPLIT: GET {identity}/internal/users/:id
async function getUser(id, { transaction } = {}) {
    if (!id) return null;
    const User = require('../modules/identity/user.model');
    const u = await User.findByPk(id, { attributes: ['id', 'full_name', 'email'], transaction });
    return u ? toUserDto(u) : null;
}

module.exports = { provisionPortalUser, issueLoginToken, lookupUsers, getUser };
