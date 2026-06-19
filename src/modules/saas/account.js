// src/modules/saas/account.js
//
// Account-level authorization. The subscriber's SuperUser is the account owner
// (Account.ownerUserId) — they administer EVERY company under the account, not
// just the companies they hold a per-company membership in. This is the seam
// that turns a per-company "Tenant Admin" into a subscriber-wide admin.

const Account = require('./account.model');
const Company = require('./company.model');

// Does this user own (administer) the given account?
async function isAccountOwner(userId, accountId, transaction) {
    if (!userId || !accountId) return false;
    const account = await Account.findByPk(accountId, { attributes: ['id', 'ownerUserId'], transaction });
    return !!account && account.ownerUserId === userId;
}

// Does this user own the account that owns the given company?
async function isAccountAdminForCompany(userId, companyId, transaction) {
    if (!userId || !companyId) return false;
    const company = await Company.findByPk(companyId, { attributes: ['id', 'accountId'], transaction });
    if (!company) return false;
    return isAccountOwner(userId, company.accountId, transaction);
}

// Every account id this user owns.
async function getOwnedAccountIds(userId, transaction) {
    if (!userId) return [];
    const accounts = await Account.findAll({ where: { ownerUserId: userId }, attributes: ['id'], transaction });
    return accounts.map(a => a.id);
}

module.exports = { isAccountOwner, isAccountAdminForCompany, getOwnedAccountIds };
