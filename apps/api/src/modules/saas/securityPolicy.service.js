// src/modules/saas/securityPolicy.service.js
//
// Tenant-level security policy (decided 2026-10-30): a subscriber may REQUIRE
// two-factor authentication for every user of its account, optionally from a
// future date so staff can be told first. The policy lives on the Account row
// (Account.mfaPolicy + Account.mfaRequiredFrom - no separate table) and is
// enforced in ONE place, the login gate (auth.controller completeLogin), by the
// same forced-enrolment path that has always applied to administrator roles.
//
// Trusted devices (2026-11-01): the same row also says whether "don't ask
// again on this device" is offered to the account's users at all
// (mfaTrustedDevicesAllowed) and for how many days a device stays trusted
// (mfaTrustedDeviceDays, 1-90, platform default 30). The login gate honours a
// device only under the policy in force TODAY, so switching the option off or
// shortening the window takes effect at the next sign-in without touching the
// stored rows.
//
// Registered workstations (2026-11-01): the same row says whether a browser
// an administrator registered for the organisation lets staff roles skip the
// code (workstationTrustEnabled, off by default). The stations are identity's
// RegisteredWorkstation rows; the switch is read at login, so turning it off
// bites at the next sign-in without touching them.
//
// Concurrent sessions (approved 2026-11-05): the same row says whether a
// user of the account may be signed in on a limited number of devices at
// once in its companies (sessionLimitEnabled, on by default) and how many
// (maxConcurrentSessions, 1-10, default 1). A sign-in beyond the limit ends
// the idlest existing session - "newest wins" - and the ended browser is
// signed out on its next request (identity's session.service). Roles may be
// exempt (Role.sessionLimitExempt); the Tenant Admin role never is, so the
// policy always governs the organisation's administrators. Platform
// administrators and the System Administration workspace are out of scope.
//
// The decision helpers are pure so the rules are unit-tested without a DB.

const { Op } = require('sequelize');
const Account = require('./account.model');
const Company = require('./company.model');
const CompanyUser = require('./companyUser.model');
const User = require('../identity/user.model');
const Role = require('./role.model');
const TrustedDevice = require('../identity/trustedDevice.model');
const RefreshToken = require('../identity/refreshToken.model');
const workstations = require('../identity/registeredWorkstation.service');
const remoteAccess = require('../identity/remoteAccessGrant.service');
const mfa = require('../identity/mfa.service');

const MFA_POLICIES = ['optional', 'required'];
const TRUSTED_DEVICE_DAYS = { min: 1, max: 90, default: 30 };
const SESSION_LIMIT = { min: 1, max: 10, default: 1 };
const REMOTE_ACCESS_DAYS = remoteAccess.GRANT_DAYS;
const DAY_MS = 24 * 60 * 60 * 1000;

// Today's date as YYYY-MM-DD in the server's clock. The policy date is a
// calendar date the Tenant Admin typed, so a plain string compare is the
// intended semantics (the day it names, server time).
function todayIso(now = new Date()) {
    return now.toISOString().slice(0, 10);
}

// Does the account's policy require MFA TODAY? 'required' with no date means
// immediately; with a date it starts on that day.
function policyRequiresMfa(account, today = todayIso()) {
    if (!account || account.mfaPolicy !== 'required') return false;
    if (!account.mfaRequiredFrom) return true;
    return String(account.mfaRequiredFrom).slice(0, 10) <= today;
}

// The login-gate decision: must this user enrol before a session is granted?
// Administrator roles have always been forced; the account policy extends the
// same gate to everyone else in the subscription.
function enrolmentRequiredFor({ mfaEnabled, isSystemAdmin, roleName, policyRequires }) {
    if (mfaEnabled) return { required: false, reason: null };
    if (isSystemAdmin || roleName === 'Tenant Admin') return { required: true, reason: 'role' };
    if (policyRequires) return { required: true, reason: 'organisation' };
    return { required: false, reason: null };
}

// The account's trusted-device rule, normalised: { allowed, days }. No account
// (the System Administration workspace) = the platform default. A stored
// value outside the range (never written by the API) falls back to the
// default rather than widening the window.
function trustedDevicePolicy(account) {
    const allowed = !account || account.mfaTrustedDevicesAllowed !== false;
    const n = account ? Number(account.mfaTrustedDeviceDays) : NaN;
    const days = Number.isInteger(n) && n >= TRUSTED_DEVICE_DAYS.min && n <= TRUSTED_DEVICE_DAYS.max
        ? n
        : TRUSTED_DEVICE_DAYS.default;
    return { allowed, days };
}

async function accountRequiresMfa(accountId, today = todayIso()) {
    if (!accountId) return false;
    const account = await Account.findByPk(accountId, { attributes: ['id', 'mfaPolicy', 'mfaRequiredFrom'] });
    return policyRequiresMfa(account, today);
}

// Does the account let registered workstations stand in for the code? No
// account (the System Administration workspace) = no.
function workstationTrustEnabled(account) {
    return !!account && account.workstationTrustEnabled === true;
}

// The account's remote-access ceiling, normalised: { maxDays }. A stored
// value outside the range falls back to the default.
function remoteAccessPolicy(account) {
    const n = account ? Number(account.remoteAccessGrantMaxDays) : NaN;
    const maxDays = Number.isInteger(n) && n >= REMOTE_ACCESS_DAYS.min && n <= REMOTE_ACCESS_DAYS.max
        ? n
        : REMOTE_ACCESS_DAYS.default;
    return { maxDays };
}

// The account's concurrent-session rule, normalised: { enabled, max }. No
// account (the System Administration workspace) = no limit. A stored count
// outside the range (never written by the API) falls back to the default
// rather than widening the limit.
function sessionLimitPolicy(account) {
    if (!account) return { enabled: false, max: SESSION_LIMIT.default };
    const n = Number(account.maxConcurrentSessions);
    const max = Number.isInteger(n) && n >= SESSION_LIMIT.min && n <= SESSION_LIMIT.max ? n : SESSION_LIMIT.default;
    return { enabled: account.sessionLimitEnabled !== false, max };
}

// The session-grant decision: the limit this sign-in must honour, or null
// when none applies - the workspace is the platform's (no company), the
// account has the rule off, the role is exempt, or the signer is a platform
// administrator (out of scope for this first cut). The Tenant Admin role is
// governed like everyone else.
function sessionLimitFor({ account, companyId, roleExempt = false, isSystemAdmin = false }) {
    if (!companyId || isSystemAdmin || roleExempt) return null;
    const rule = sessionLimitPolicy(account);
    return rule.enabled ? { max: rule.max } : null;
}

async function sessionLimitForAccount(accountId, { companyId, roleExempt, isSystemAdmin }) {
    if (!accountId) return null;
    const account = await Account.findByPk(accountId, { attributes: ['id', 'sessionLimitEnabled', 'maxConcurrentSessions'] });
    return sessionLimitFor({ account, companyId, roleExempt, isSystemAdmin });
}

async function remoteAccessPolicyForAccount(accountId) {
    if (!accountId) return remoteAccessPolicy(null);
    const account = await Account.findByPk(accountId, { attributes: ['id', 'remoteAccessGrantMaxDays'] });
    return remoteAccessPolicy(account);
}

async function workstationTrustEnabledForAccount(accountId) {
    if (!accountId) return false;
    const account = await Account.findByPk(accountId, { attributes: ['id', 'workstationTrustEnabled'] });
    return workstationTrustEnabled(account);
}

async function trustedDevicePolicyForAccount(accountId) {
    if (!accountId) return trustedDevicePolicy(null);
    const account = await Account.findByPk(accountId, { attributes: ['id', 'mfaTrustedDevicesAllowed', 'mfaTrustedDeviceDays'] });
    return trustedDevicePolicy(account);
}

// The account that owns a company (null for the System Administration
// workspace, which has no subscriber account).
async function accountIdForCompany(companyId) {
    if (!companyId) return null;
    const company = await Company.findByPk(companyId, { attributes: ['accountId'] });
    return company ? company.accountId : null;
}

// Everyone the policy reaches: the distinct active members of the account's
// companies plus the account owner (who may hold no membership row).
async function policyUserIds(account) {
    const companies = await Company.findAll({ where: { accountId: account.id }, attributes: ['id'] });
    const ids = new Set();
    if (companies.length) {
        const members = await CompanyUser.findAll({
            where: { companyId: { [Op.in]: companies.map((c) => c.id) }, isActive: true },
            attributes: ['userId'],
        });
        for (const m of members) ids.add(m.userId);
    }
    if (account.ownerUserId) ids.add(account.ownerUserId);
    return [...ids];
}

// Trusted devices of the policy's users that the login gate would honour
// TODAY under the stored rule: live rows no older than the window. Zero when
// the option is off (nothing is honoured then).
async function honouredTrustedDevices(userIds, trust, now = new Date()) {
    if (!trust.allowed || !userIds.length) return 0;
    return TrustedDevice.count({
        where: {
            userId: { [Op.in]: userIds },
            revokedAt: null,
            expiresAt: { [Op.gt]: now },
            createdAt: { [Op.gt]: new Date(now.getTime() - trust.days * DAY_MS) },
        },
    });
}

// The live sign-in sessions of the policy's users in the account's companies
// right now: how many users are signed in and on how many sessions (one
// rotation family = one session), and how many of them hold more sessions
// than `max` - the ones whose next sign-in would end a session.
async function liveSessionCounts(userIds, max, now = new Date()) {
    if (!userIds.length) return { signedInUsers: 0, liveSessions: 0, usersOverLimit: 0 };
    const rows = await RefreshToken.findAll({
        where: { userId: { [Op.in]: userIds }, revokedAt: null, expiresAt: { [Op.gt]: now }, companyId: { [Op.ne]: null } },
        attributes: ['userId', 'familyId'],
    });
    const perUser = new Map();
    for (const r of rows) {
        if (!perUser.has(r.userId)) perUser.set(r.userId, new Set());
        perUser.get(r.userId).add(r.familyId);
    }
    let liveSessions = 0;
    let usersOverLimit = 0;
    for (const families of perUser.values()) {
        liveSessions += families.size;
        if (families.size > max) usersOverLimit += 1;
    }
    return { signedInUsers: perUser.size, liveSessions, usersOverLimit };
}

// What the Security Policy screen shows: the stored policy, whether it is in
// force today, and the expected result (how many users would be asked to
// enrol at their next sign-in; how many devices currently skip the code) -
// the show-expected-results principle.
async function getSecurityPolicyState(accountId, today = todayIso()) {
    const account = await Account.findByPk(accountId, {
        attributes: ['id', 'ownerUserId', 'mfaPolicy', 'mfaRequiredFrom', 'mfaTrustedDevicesAllowed', 'mfaTrustedDeviceDays', 'workstationTrustEnabled', 'remoteAccessGrantMaxDays', 'sessionLimitEnabled', 'maxConcurrentSessions'],
    });
    if (!account) return null;
    const userIds = await policyUserIds(account);
    const enrolled = userIds.length
        ? await User.count({ where: { id: { [Op.in]: userIds }, mfaEnabled: true } })
        : 0;
    const trust = trustedDevicePolicy(account);
    const trustedDevices = await honouredTrustedDevices(userIds, trust);
    const liveWorkstations = await workstations.countLiveWorkstations(account.id);
    const lockedRoles = await Role.count({ where: { accountId: account.id, signInLockedToWorkstations: true } });
    const activeGrants = await remoteAccess.countActiveGrants(account.id);
    const pendingRequests = await remoteAccess.countPendingRequests(account.id);
    const sessionRule = sessionLimitPolicy(account);
    const exemptRoles = await Role.count({ where: { accountId: account.id, sessionLimitExempt: true } });
    const sessions = await liveSessionCounts(userIds, sessionRule.max);
    return {
        // Without MFA_ENCRYPTION_KEY the platform cannot enrol anyone, so the
        // login gate is dormant and a 'required' policy has no effect yet -
        // the screen says so instead of promising one.
        mfaAvailable: mfa.isMfaConfigured(),
        mfaPolicy: account.mfaPolicy || 'optional',
        mfaRequiredFrom: account.mfaRequiredFrom ? String(account.mfaRequiredFrom).slice(0, 10) : null,
        effective: policyRequiresMfa(account, today),
        users: userIds.length,
        enrolled,
        notEnrolled: userIds.length - enrolled,
        trustedDevicesAllowed: trust.allowed,
        trustedDeviceDays: trust.days,
        trustedDevices,
        // Registered workstations: whether they count, and how many are live.
        workstationTrustEnabled: workstationTrustEnabled(account),
        workstations: liveWorkstations,
        // Roles whose holders may sign in only from a registered workstation.
        lockedRoles,
        // Remote-access grants: the ceiling an approver may give, how many
        // grants are in force and how many requests wait for a decision.
        remoteAccessGrantMaxDays: remoteAccessPolicy(account).maxDays,
        activeGrants,
        pendingRequests,
        // Concurrent sessions (2026-11-05): the rule, the roles exempt from
        // it, and who is signed in right now - users, sessions, and users
        // holding more sessions than the limit (their next sign-in ends one).
        sessionLimitEnabled: sessionRule.enabled,
        maxConcurrentSessions: sessionRule.max,
        exemptRoles,
        signedInUsers: sessions.signedInUsers,
        liveSessions: sessions.liveSessions,
        usersOverLimit: sessions.usersOverLimit,
    };
}

// Validate + persist. `mfaRequiredFrom` only means something while the policy
// is 'required'; it is cleared otherwise so a stale date can never resurface.
// The trusted-device keys are optional: omitted = keep what is stored.
async function applySecurityPolicy(accountId, body) {
    const account = await Account.findByPk(accountId);
    if (!account) return { error: 404, message: 'Account not found.' };

    const policy = String(body.mfaPolicy || 'optional').trim().toLowerCase();
    if (!MFA_POLICIES.includes(policy)) return { error: 400, message: 'mfaPolicy must be optional or required.' };

    let from = null;
    if (policy === 'required' && body.mfaRequiredFrom) {
        const raw = String(body.mfaRequiredFrom).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
            return { error: 400, message: 'mfaRequiredFrom must be a date (YYYY-MM-DD).' };
        }
        from = raw;
    }

    const current = trustedDevicePolicy(account);
    let trustedAllowed = current.allowed;
    if (body.trustedDevicesAllowed !== undefined && body.trustedDevicesAllowed !== null) {
        if (typeof body.trustedDevicesAllowed !== 'boolean') {
            return { error: 400, message: 'trustedDevicesAllowed must be true or false.' };
        }
        trustedAllowed = body.trustedDevicesAllowed;
    }
    let trustedDays = current.days;
    if (body.trustedDeviceDays !== undefined && body.trustedDeviceDays !== null) {
        const n = Number(body.trustedDeviceDays);
        if (!Number.isInteger(n) || n < TRUSTED_DEVICE_DAYS.min || n > TRUSTED_DEVICE_DAYS.max) {
            return { error: 400, message: `trustedDeviceDays must be a whole number from ${TRUSTED_DEVICE_DAYS.min} to ${TRUSTED_DEVICE_DAYS.max}.` };
        }
        trustedDays = n;
    }

    let stationsEnabled = workstationTrustEnabled(account);
    if (body.workstationTrustEnabled !== undefined && body.workstationTrustEnabled !== null) {
        if (typeof body.workstationTrustEnabled !== 'boolean') {
            return { error: 400, message: 'workstationTrustEnabled must be true or false.' };
        }
        stationsEnabled = body.workstationTrustEnabled;
    }

    let grantMaxDays = remoteAccessPolicy(account).maxDays;
    if (body.remoteAccessGrantMaxDays !== undefined && body.remoteAccessGrantMaxDays !== null) {
        const n = Number(body.remoteAccessGrantMaxDays);
        if (!Number.isInteger(n) || n < REMOTE_ACCESS_DAYS.min || n > REMOTE_ACCESS_DAYS.max) {
            return { error: 400, message: `remoteAccessGrantMaxDays must be a whole number from ${REMOTE_ACCESS_DAYS.min} to ${REMOTE_ACCESS_DAYS.max}.` };
        }
        grantMaxDays = n;
    }

    const sessionRule = sessionLimitPolicy(account);
    let sessionLimitEnabled = sessionRule.enabled;
    if (body.sessionLimitEnabled !== undefined && body.sessionLimitEnabled !== null) {
        if (typeof body.sessionLimitEnabled !== 'boolean') {
            return { error: 400, message: 'sessionLimitEnabled must be true or false.' };
        }
        sessionLimitEnabled = body.sessionLimitEnabled;
    }
    let maxSessions = sessionRule.max;
    if (body.maxConcurrentSessions !== undefined && body.maxConcurrentSessions !== null) {
        const n = Number(body.maxConcurrentSessions);
        if (!Number.isInteger(n) || n < SESSION_LIMIT.min || n > SESSION_LIMIT.max) {
            return { error: 400, message: `maxConcurrentSessions must be a whole number from ${SESSION_LIMIT.min} to ${SESSION_LIMIT.max}.` };
        }
        maxSessions = n;
    }

    account.mfaPolicy = policy;
    account.mfaRequiredFrom = from;
    account.mfaTrustedDevicesAllowed = trustedAllowed;
    account.mfaTrustedDeviceDays = trustedDays;
    account.workstationTrustEnabled = stationsEnabled;
    account.remoteAccessGrantMaxDays = grantMaxDays;
    account.sessionLimitEnabled = sessionLimitEnabled;
    account.maxConcurrentSessions = maxSessions;
    await account.save();
    return { ok: true };
}

module.exports = {
    MFA_POLICIES,
    TRUSTED_DEVICE_DAYS,
    SESSION_LIMIT,
    todayIso,
    policyRequiresMfa,
    enrolmentRequiredFor,
    trustedDevicePolicy,
    workstationTrustEnabled,
    remoteAccessPolicy,
    accountRequiresMfa,
    trustedDevicePolicyForAccount,
    workstationTrustEnabledForAccount,
    remoteAccessPolicyForAccount,
    sessionLimitPolicy,
    sessionLimitFor,
    sessionLimitForAccount,
    accountIdForCompany,
    getSecurityPolicyState,
    applySecurityPolicy,
};
