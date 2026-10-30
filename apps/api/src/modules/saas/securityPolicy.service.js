// src/modules/saas/securityPolicy.service.js
//
// Tenant-level security policy (decided 2026-10-30): a subscriber may REQUIRE
// two-factor authentication for every user of its account, optionally from a
// future date so staff can be told first. The policy lives on the Account row
// (Account.mfaPolicy + Account.mfaRequiredFrom - no separate table) and is
// enforced in ONE place, the login gate (auth.controller completeLogin), by the
// same forced-enrolment path that has always applied to administrator roles.
//
// The decision helpers are pure so the rules are unit-tested without a DB.

const { Op } = require('sequelize');
const Account = require('./account.model');
const Company = require('./company.model');
const CompanyUser = require('./companyUser.model');
const User = require('../identity/user.model');
const mfa = require('../identity/mfa.service');

const MFA_POLICIES = ['optional', 'required'];

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

async function accountRequiresMfa(accountId, today = todayIso()) {
    if (!accountId) return false;
    const account = await Account.findByPk(accountId, { attributes: ['id', 'mfaPolicy', 'mfaRequiredFrom'] });
    return policyRequiresMfa(account, today);
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

// What the Security Policy screen shows: the stored policy, whether it is in
// force today, and the expected result (how many users would be asked to
// enrol at their next sign-in) - the show-expected-results principle.
async function getSecurityPolicyState(accountId, today = todayIso()) {
    const account = await Account.findByPk(accountId, { attributes: ['id', 'ownerUserId', 'mfaPolicy', 'mfaRequiredFrom'] });
    if (!account) return null;
    const userIds = await policyUserIds(account);
    const enrolled = userIds.length
        ? await User.count({ where: { id: { [Op.in]: userIds }, mfaEnabled: true } })
        : 0;
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
    };
}

// Validate + persist. `mfaRequiredFrom` only means something while the policy
// is 'required'; it is cleared otherwise so a stale date can never resurface.
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

    account.mfaPolicy = policy;
    account.mfaRequiredFrom = from;
    await account.save();
    return { ok: true };
}

module.exports = {
    MFA_POLICIES,
    todayIso,
    policyRequiresMfa,
    enrolmentRequiredFor,
    accountRequiresMfa,
    accountIdForCompany,
    getSecurityPolicyState,
    applySecurityPolicy,
};
