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
// The decision helpers are pure so the rules are unit-tested without a DB.

const { Op } = require('sequelize');
const Account = require('./account.model');
const Company = require('./company.model');
const CompanyUser = require('./companyUser.model');
const User = require('../identity/user.model');
const TrustedDevice = require('../identity/trustedDevice.model');
const workstations = require('../identity/registeredWorkstation.service');
const mfa = require('../identity/mfa.service');

const MFA_POLICIES = ['optional', 'required'];
const TRUSTED_DEVICE_DAYS = { min: 1, max: 90, default: 30 };
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

// What the Security Policy screen shows: the stored policy, whether it is in
// force today, and the expected result (how many users would be asked to
// enrol at their next sign-in; how many devices currently skip the code) -
// the show-expected-results principle.
async function getSecurityPolicyState(accountId, today = todayIso()) {
    const account = await Account.findByPk(accountId, {
        attributes: ['id', 'ownerUserId', 'mfaPolicy', 'mfaRequiredFrom', 'mfaTrustedDevicesAllowed', 'mfaTrustedDeviceDays', 'workstationTrustEnabled'],
    });
    if (!account) return null;
    const userIds = await policyUserIds(account);
    const enrolled = userIds.length
        ? await User.count({ where: { id: { [Op.in]: userIds }, mfaEnabled: true } })
        : 0;
    const trust = trustedDevicePolicy(account);
    const trustedDevices = await honouredTrustedDevices(userIds, trust);
    const liveWorkstations = await workstations.countLiveWorkstations(account.id);
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

    account.mfaPolicy = policy;
    account.mfaRequiredFrom = from;
    account.mfaTrustedDevicesAllowed = trustedAllowed;
    account.mfaTrustedDeviceDays = trustedDays;
    account.workstationTrustEnabled = stationsEnabled;
    await account.save();
    return { ok: true };
}

module.exports = {
    MFA_POLICIES,
    TRUSTED_DEVICE_DAYS,
    todayIso,
    policyRequiresMfa,
    enrolmentRequiredFor,
    trustedDevicePolicy,
    workstationTrustEnabled,
    accountRequiresMfa,
    trustedDevicePolicyForAccount,
    workstationTrustEnabledForAccount,
    accountIdForCompany,
    getSecurityPolicyState,
    applySecurityPolicy,
};
