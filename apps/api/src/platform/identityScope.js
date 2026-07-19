// src/platform/identityScope.js
//
// Resolve the EMAIL-BRANDING scope for a platform identity (User), for account /
// security emails that are triggered by email alone (password reset) or from a
// context we don't want to trust for branding. Returns { accountId, companyId }
// to feed the EmailTemplate cascade + brand logo.
//
// The hard case is "email in, who are you?": one identity can belong to several
// companies across several subscriber accounts, and a password reset is about the
// LOGIN, not any one club. So we resolve the best UNAMBIGUOUS scope and otherwise
// degrade to the platform default. Precedence:
//   1. their last-used workspace (User.lastWorkspaceId), when it's a real company
//   2. else the single company they belong to (staff CompanyUser or member link)
//   3. else, if all their companies share one account, that account (subscriber-wide)
//   4. else the platform default ({ null, null })
//
// Reads control-plane (Company, CompanyUser) directly; the member link is reached
// through an in-process lazy require of the membership Member (same seam pattern as
// identityGateway) - it becomes a peer read when the services split. No FK either way.

const PLATFORM = { accountId: null, companyId: null };

async function resolveIdentityScope(user) {
    if (!user || !user.id) return PLATFORM;
    const Company = require('../modules/saas/company.model');

    // 1. Last-used workspace, when it's a real company (not the 'SYSTEM' sentinel).
    const last = user.lastWorkspaceId;
    if (last && last !== 'SYSTEM') {
        const company = await Company.findByPk(last, { attributes: ['id', 'accountId'] });
        if (company) return { accountId: company.accountId, companyId: company.id };
    }

    // 2. Every company this identity is tied to: staff memberships + member links.
    const CompanyUser = require('../modules/saas/companyUser.model');
    const Member = require('../modules/membership/member.model');
    const [staff, members] = await Promise.all([
        CompanyUser.findAll({ where: { userId: user.id }, attributes: ['companyId'] }),
        Member.findAll({ where: { userId: user.id }, attributes: ['companyId'] }),
    ]);
    const companyIds = [...new Set([...staff, ...members].map((r) => r.companyId).filter(Boolean))];
    if (!companyIds.length) return PLATFORM;

    const companies = await Company.findAll({ where: { id: companyIds }, attributes: ['id', 'accountId'] });
    if (companies.length === 1) {
        return { accountId: companies[0].accountId, companyId: companies[0].id };
    }

    // 3. Multiple companies: brand subscriber-wide if they all share one account.
    const accountIds = [...new Set(companies.map((c) => c.accountId).filter(Boolean))];
    if (accountIds.length === 1) return { accountId: accountIds[0], companyId: null };

    // 4. Ambiguous (spans accounts) -> platform default, no wrong guess.
    return PLATFORM;
}

module.exports = { resolveIdentityScope };
